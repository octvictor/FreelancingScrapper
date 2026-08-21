// Nexus - the whole app as one force-directed node graph, Obsidian-style.
// Canvas-rendered rather than SVG/DOM on purpose: this is built for the
// graph the app will have after a year of use (thousands of nodes), not
// the dozen it holds today, and a node-per-DOM-element approach stops
// being viable long before that. Data comes from GET /api/nexus/graph
// (see get_nexus_graph in storage/db.py) - the hierarchy is fixed there,
// this file only lays it out and draws it.
//
// What keeps it fast at scale, in order of how much it matters:
//
//  1. Barnes-Hut approximation for the repulsion force. Every node
//     pushes every other node away, which is O(n^2) done literally - at
//     2000 nodes that's 4M interactions per tick, and the tab dies.
//     Instead each tick builds a quadtree and treats any cell far enough
//     away (width/distance < THETA) as a single averaged body, which
//     drops it to O(n log n): ~22k interactions for the same 2000 nodes.
//  2. The simulation cools and *stops*. Alpha decays toward ALPHA_MIN,
//     then the rAF loop exits entirely rather than idling at 60fps
//     forever. A settled graph costs nothing.
//  3. Rendering is dirty-flagged - a frame is drawn on change (tick,
//     pan, zoom, hover), not on a permanent loop.
//  4. Labels are level-of-detail: text is by far the most expensive
//     thing a 2D canvas draws, so labels only render when zoomed in far
//     enough that they'd actually be readable, and only for nodes on
//     screen. Everything is viewport-culled.
//
// $()/navigateTo come from nav.js; the modal openers come from each
// tool's own file (script order in index.html puts this last).

const NEXUS_LINK_DISTANCE = 70;   // resting length of a parent->child link
const NEXUS_LINK_STRENGTH = 0.08;
const NEXUS_CHARGE = -260;        // repulsion; negative = push apart
const NEXUS_THETA = 0.9;          // Barnes-Hut accuracy/speed tradeoff
const NEXUS_CENTER_PULL = 0.006;  // holds the four disconnected roots together
const NEXUS_VELOCITY_DECAY = 0.6; // friction; higher = settles sooner
const NEXUS_ALPHA_DECAY = 0.0228;
const NEXUS_ALPHA_MIN = 0.001;
const NEXUS_LABEL_FADE = 0.28;     // labels fade out below 2x this zoom
const NEXUS_LABEL_BUDGET = 400;   // never draw more labels than this in a frame

// One hue per tool, so a cluster reads as "that's To Do" before you can
// read a single label. Kept in the same muted family as the app's own
// palette rather than raw primaries.
const NEXUS_TOOL_COLORS = {
    tracker: "#5C8C74",
    todo: "#597792",
    notes: "#B08968",
    finance: "#7C6A9C",
};

let nexusNodes = [];
let nexusLinks = [];
let nexusById = new Map();
let nexusAlpha = 0;
let nexusRunning = false;
let nexusNeedsDraw = false;
let nexusHoverId = null;
let nexusDragNode = null;
let nexusPointerDown = null;
let nexusLoaded = false;
let nexusUserAdjusted = false;   // set on first manual pan/zoom - auto-fit yields for good

const nexusCamera = { x: 0, y: 0, scale: 1 };

function nexusPrefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ---------- Barnes-Hut quadtree ----------
// Only ever built for the repulsion pass, then thrown away - it holds
// the averaged centre of mass per cell, which is the whole trick.

function nexusBuildQuadtree(nodes) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
        if (n.x < minX) minX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.x > maxX) maxX = n.x;
        if (n.y > maxY) maxY = n.y;
    }
    if (!nodes.length) return null;
    // Square the bounds so cells stay square and `width/distance` is meaningful.
    const size = Math.max(maxX - minX, maxY - minY) || 1;
    const root = { x0: minX, y0: minY, size, mass: 0, cx: 0, cy: 0, node: null, kids: null };

    function insert(cell, node, depth) {
        cell.mass += 1;
        cell.cx += node.x;
        cell.cy += node.y;
        if (depth > 20) return; // coincident points - stop subdividing
        if (!cell.kids && !cell.node) {
            cell.node = node;
            return;
        }
        if (!cell.kids) {
            cell.kids = [null, null, null, null];
            const existing = cell.node;
            cell.node = null;
            place(cell, existing, depth);
        }
        place(cell, node, depth);
    }

    function place(cell, node, depth) {
        const half = cell.size / 2;
        const right = node.x >= cell.x0 + half ? 1 : 0;
        const bottom = node.y >= cell.y0 + half ? 1 : 0;
        const i = bottom * 2 + right;
        if (!cell.kids[i]) {
            cell.kids[i] = {
                x0: cell.x0 + right * half,
                y0: cell.y0 + bottom * half,
                size: half, mass: 0, cx: 0, cy: 0, node: null, kids: null,
            };
        }
        insert(cell.kids[i], node, depth + 1);
    }

    for (const n of nodes) insert(root, n, 0);
    return root;
}

function nexusApplyRepulsion(node, cell, alpha) {
    if (!cell || !cell.mass) return;
    const cx = cell.cx / cell.mass;
    const cy = cell.cy / cell.mass;
    let dx = cx - node.x;
    let dy = cy - node.y;
    let distSq = dx * dx + dy * dy;
    if (distSq < 0.01) {
        // Perfectly coincident nodes have no direction to separate along -
        // nudge deterministically so the layout stays reproducible.
        dx = (node.index % 7) - 3;
        dy = (node.index % 5) - 2;
        distSq = dx * dx + dy * dy || 1;
    }
    const dist = Math.sqrt(distSq);

    // Far enough away that the whole cell can act as one averaged body.
    if (cell.node || cell.size / dist < NEXUS_THETA) {
        if (cell.node === node) return;
        const force = (NEXUS_CHARGE * cell.mass * alpha) / distSq;
        node.vx += (dx / dist) * force;
        node.vy += (dy / dist) * force;
        return;
    }
    for (const kid of cell.kids) nexusApplyRepulsion(node, kid, alpha);
}

// ---------- Simulation ----------

function nexusTick() {
    const alpha = nexusAlpha;

    const tree = nexusBuildQuadtree(nexusNodes);
    for (const n of nexusNodes) nexusApplyRepulsion(n, tree, alpha);

    // Links pull parent and child toward the resting distance.
    for (const link of nexusLinks) {
        const a = link.source;
        const b = link.target;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = ((dist - NEXUS_LINK_DISTANCE) / dist) * alpha * NEXUS_LINK_STRENGTH;
        const fx = dx * force;
        const fy = dy * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
    }

    // The graph is a forest - four roots with no links between them - so
    // without this they'd repel each other out to infinity. A weak pull
    // toward the origin is what keeps them a graph rather than four
    // clusters drifting off in different directions.
    for (const n of nexusNodes) {
        n.vx -= n.x * NEXUS_CENTER_PULL * alpha;
        n.vy -= n.y * NEXUS_CENTER_PULL * alpha;
    }

    for (const n of nexusNodes) {
        if (n === nexusDragNode) { n.vx = 0; n.vy = 0; continue; }
        n.vx *= NEXUS_VELOCITY_DECAY;
        n.vy *= NEXUS_VELOCITY_DECAY;
        n.x += n.vx;
        n.y += n.vy;
    }

    nexusAlpha += (0 - nexusAlpha) * NEXUS_ALPHA_DECAY;
}

function nexusReheat(target = 0.4) {
    nexusAlpha = Math.max(nexusAlpha, target);
    nexusStart();
}

function nexusStart() {
    if (nexusRunning) return;
    nexusRunning = true;
    requestAnimationFrame(nexusFrame);
}

function nexusFrame() {
    if (nexusAlpha > NEXUS_ALPHA_MIN) {
        nexusTick();
        nexusFitToView();
        nexusNeedsDraw = true;
    }
    if (nexusNeedsDraw) {
        nexusDraw();
        nexusNeedsDraw = false;
    }
    // Settled and nothing pending: stop the loop entirely rather than
    // idle at 60fps. Any interaction calls nexusStart() again.
    if (nexusAlpha <= NEXUS_ALPHA_MIN && !nexusDragNode) {
        nexusRunning = false;
        return;
    }
    requestAnimationFrame(nexusFrame);
}

// ---------- Rendering ----------

function nexusCanvas() {
    return $("nexus-canvas");
}

function nexusResize() {
    const canvas = nexusCanvas();
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    nexusNeedsDraw = true;
    nexusStart();
}

// Radius in graph units. The floor matters at scale: a 5000-node layout
// settles ~11k units across, so fitting it puts the camera near 0.08 - at
// which a 4-unit node is a third of a pixel and the graph renders as an
// empty page. Holding a minimum *screen* radius keeps it a legible cloud
// you can zoom into, which is the only honest way to show that many nodes
// at once.
const NEXUS_MIN_SCREEN_RADIUS = 1.4;

function nexusNodeRadius(node) {
    const base = node.kind === "root" ? 9 : 4 + Math.min(4, node.degree * 0.6);
    return Math.max(base, NEXUS_MIN_SCREEN_RADIUS / nexusCamera.scale);
}

function nexusNodeColor(node) {
    return node.meta.color || NEXUS_TOOL_COLORS[node.tool] || "#8a8880";
}

function nexusDraw() {
    const canvas = nexusCanvas();
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.translate(w / 2 + nexusCamera.x, h / 2 + nexusCamera.y);
    ctx.scale(nexusCamera.scale, nexusCamera.scale);

    // Everything outside this rect (in graph space) is skipped.
    const pad = 80;
    const view = {
        x0: (-w / 2 - nexusCamera.x) / nexusCamera.scale - pad,
        y0: (-h / 2 - nexusCamera.y) / nexusCamera.scale - pad,
        x1: (w / 2 - nexusCamera.x) / nexusCamera.scale + pad,
        y1: (h / 2 - nexusCamera.y) / nexusCamera.scale + pad,
    };
    const visible = (n) => n.x >= view.x0 && n.x <= view.x1 && n.y >= view.y0 && n.y <= view.y1;

    const hovered = nexusHoverId ? nexusById.get(nexusHoverId) : null;
    const related = new Set();
    if (hovered) {
        related.add(hovered.id);
        for (const l of nexusLinks) {
            if (l.source.id === hovered.id) related.add(l.target.id);
            else if (l.target.id === hovered.id) related.add(l.source.id);
        }
    }

    ctx.lineWidth = 1 / nexusCamera.scale;
    for (const link of nexusLinks) {
        if (!visible(link.source) && !visible(link.target)) continue;
        const lit = hovered && (related.has(link.source.id) && related.has(link.target.id));
        ctx.strokeStyle = lit ? "rgba(40,40,40,0.45)" : "rgba(40,40,40,0.13)";
        ctx.beginPath();
        ctx.moveTo(link.source.x, link.source.y);
        ctx.lineTo(link.target.x, link.target.y);
        ctx.stroke();
    }

    for (const n of nexusNodes) {
        if (!visible(n)) continue;
        const r = nexusNodeRadius(n);
        const dimmed = hovered && !related.has(n.id);
        ctx.globalAlpha = dimmed ? 0.25 : 1;
        ctx.fillStyle = nexusNodeColor(n);
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
        if (n.id === nexusHoverId) {
            ctx.strokeStyle = "#282828";
            ctx.lineWidth = 2 / nexusCamera.scale;
            ctx.stroke();
            ctx.lineWidth = 1 / nexusCamera.scale;
        }
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // Labels are drawn in screen space, not graph space, so they stay a
    // constant readable size instead of shrinking to nothing as you zoom
    // out. Two things keep them from turning into the unreadable pile a
    // naive "label every node" pass produces:
    //
    //  - a real collision test. Each candidate's screen rect is checked
    //    against the ones already placed and skipped if it would overlap,
    //    so density thins out on its own as you zoom out - no magic zoom
    //    threshold to tune.
    //  - priority order. Roots are placed first so they always win the
    //    space and you keep your bearings; then hovered/related nodes;
    //    then everything else, capped by budget because text is by far
    //    the most expensive thing a 2D canvas draws.
    //  - a zoom fade. Collision alone keeps labels from overlapping each
    //    other, but zoomed far enough out they still sit as a wash of text
    //    over a cluster too dense to map any of them to a node. They fade
    //    out below NEXUS_LABEL_FADE and you zoom in to read them - which
    //    also skips the whole pass, the most expensive part of a frame,
    //    exactly when there are the most nodes to draw.
    const labelAlpha = Math.min(1, Math.max(0, (nexusCamera.scale - NEXUS_LABEL_FADE) / NEXUS_LABEL_FADE));
    if (labelAlpha < 0.02) return;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '11px "Google Sans Flex", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const toScreenX = (gx) => gx * nexusCamera.scale + w / 2 + nexusCamera.x;
    const toScreenY = (gy) => gy * nexusCamera.scale + h / 2 + nexusCamera.y;

    const candidates = nexusNodes.filter((n) => visible(n));
    candidates.sort((a, b) => {
        const rank = (n) => (n.kind === "root" ? 0 : related.has(n.id) ? 1 : 2);
        return rank(a) - rank(b) || b.degree - a.degree;
    });

    const placed = [];
    let drawn = 0;
    for (const n of candidates) {
        if (drawn >= NEXUS_LABEL_BUDGET) break;
        // When something is hovered, everything unrelated goes quiet -
        // the point of hovering is to isolate one neighbourhood.
        if (hovered && !related.has(n.id) && n.kind !== "root") continue;

        const sx = toScreenX(n.x);
        const sy = toScreenY(n.y) + nexusNodeRadius(n) * nexusCamera.scale + 3;
        // The rect is padded past the glyphs on both axes: a collision
        // test tight to the text lets two labels sit 1px apart and pass,
        // which reads as a collision even though it technically isn't.
        const halfW = ctx.measureText(n.label).width / 2 + 5;
        const rect = [sx - halfW, sy - 2, sx + halfW, sy + 16];
        if (rect[2] < 0 || rect[0] > w || rect[3] < 0 || rect[1] > h) continue;

        let clash = false;
        for (const p of placed) {
            if (rect[0] < p[2] && rect[2] > p[0] && rect[1] < p[3] && rect[3] > p[1]) { clash = true; break; }
        }
        if (clash) continue;

        ctx.globalAlpha = labelAlpha * (hovered && !related.has(n.id) ? 0.45 : 1);
        ctx.fillStyle = n.kind === "root" ? "#282828" : "#606060";
        ctx.fillText(n.label, sx, sy);
        placed.push(rect);
        drawn++;
    }
    ctx.globalAlpha = 1;
    ctx.restore();
}

// Keeps the whole graph in frame while it settles, then gets out of the
// way permanently the moment the user pans or zooms - auto-framing that
// fights your own navigation is worse than none. Lerped rather than
// snapped so the camera eases out as the layout expands instead of
// jumping every tick.
function nexusFitToView() {
    if (nexusUserAdjusted || !nexusNodes.length) return;
    const canvas = nexusCanvas();
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    if (w < 2 || h < 2) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let sumX = 0, sumY = 0;
    for (const n of nexusNodes) {
        if (n.x < minX) minX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.x > maxX) maxX = n.x;
        if (n.y > maxY) maxY = n.y;
        sumX += n.x; sumY += n.y;
    }

    // Framing to the raw bounding box lets two stragglers on a long link
    // dictate the whole view - the mass of the graph ends up shoved into a
    // corner while most of the canvas frames empty space. Clamping the box
    // to three standard deviations around the centroid keeps the framing on
    // where the nodes actually are. Clamped to the true box, so on an evenly
    // spread graph (which is most of them) this changes nothing.
    const count = nexusNodes.length;
    const meanX = sumX / count;
    const meanY = sumY / count;
    let varX = 0, varY = 0;
    for (const n of nexusNodes) {
        varX += (n.x - meanX) * (n.x - meanX);
        varY += (n.y - meanY) * (n.y - meanY);
    }
    const spreadX = Math.sqrt(varX / count) * 3;
    const spreadY = Math.sqrt(varY / count) * 3;
    minX = Math.max(minX, meanX - spreadX);
    maxX = Math.min(maxX, meanX + spreadX);
    minY = Math.max(minY, meanY - spreadY);
    maxY = Math.min(maxY, meanY + spreadY);
    // The pad is in graph units, so it has to shrink as the graph grows or
    // it dominates the framing of a small one and is invisible on a big one.
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const pad = Math.max(20, Math.min(90, Math.max(spanX, spanY) * 0.08));
    // No floor beyond guarding a divide-by-zero: a floor here is what makes
    // a large graph render as an off-screen sliver instead of fitting.
    const targetScale = Math.min(2, Math.min(w / (spanX + pad * 2), h / (spanY + pad * 2)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const targetX = -cx * targetScale;
    const targetY = -cy * targetScale;

    const k = 0.12;
    nexusCamera.scale += (targetScale - nexusCamera.scale) * k;
    nexusCamera.x += (targetX - nexusCamera.x) * k;
    nexusCamera.y += (targetY - nexusCamera.y) * k;
}

// ---------- Interaction ----------

function nexusPointerToGraph(e) {
    const canvas = nexusCanvas();
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    return {
        x: (px - rect.width / 2 - nexusCamera.x) / nexusCamera.scale,
        y: (py - rect.height / 2 - nexusCamera.y) / nexusCamera.scale,
    };
}

function nexusNodeAt(gx, gy) {
    // Reverse order so the topmost-drawn node wins, matching what's seen.
    for (let i = nexusNodes.length - 1; i >= 0; i--) {
        const n = nexusNodes[i];
        const r = nexusNodeRadius(n) + 4 / nexusCamera.scale;
        const dx = n.x - gx;
        const dy = n.y - gy;
        if (dx * dx + dy * dy <= r * r) return n;
    }
    return null;
}

function nexusOpenNode(node) {
    if (node.kind === "root") {
        navigateTo(node.tool === "finance" ? "finance" : node.tool);
        return;
    }
    if (node.kind === "project") {
        navigateTo("tracker");
        if (typeof openProjectModal === "function") openProjectModal(node.ref);
    } else if (node.kind === "personal-project") {
        navigateTo("tracker");
        if (typeof openPersonalProjectModal === "function") openPersonalProjectModal(node.ref);
    } else if (node.kind === "list") {
        navigateTo("todo");
    } else if (node.kind === "task") {
        navigateTo("todo");
        if (typeof openTodoTaskModal === "function") openTodoTaskModal(node.meta.list_id, node.ref);
    } else if (node.kind === "note") {
        navigateTo("notes");
        if (typeof openNoteModal === "function") openNoteModal(node.ref);
    } else if (node.kind === "finance-table") {
        navigateTo("finance");
        if (typeof switchFinanceTable === "function") switchFinanceTable(node.ref);
    }
}

function nexusWireCanvas() {
    const canvas = nexusCanvas();
    if (!canvas || canvas.dataset.wired) return;
    canvas.dataset.wired = "1";

    canvas.addEventListener("pointerdown", (e) => {
        const g = nexusPointerToGraph(e);
        const node = nexusNodeAt(g.x, g.y);
        nexusPointerDown = { x: e.clientX, y: e.clientY, node, moved: false };
        if (node) {
            nexusDragNode = node;
            nexusReheat(0.3);
        }
        canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener("pointermove", (e) => {
        const g = nexusPointerToGraph(e);

        if (nexusPointerDown) {
            const dx = e.clientX - nexusPointerDown.x;
            const dy = e.clientY - nexusPointerDown.y;
            if (dx * dx + dy * dy > 9) nexusPointerDown.moved = true;

            if (nexusDragNode) {
                nexusDragNode.x = g.x;
                nexusDragNode.y = g.y;
                nexusNeedsDraw = true;
                nexusReheat(0.3);
                return;
            }
            if (nexusPointerDown.moved) {
                nexusUserAdjusted = true;
                nexusCamera.x += e.movementX;
                nexusCamera.y += e.movementY;
                nexusNeedsDraw = true;
                nexusStart();
                return;
            }
        }

        const hit = nexusNodeAt(g.x, g.y);
        const id = hit ? hit.id : null;
        if (id !== nexusHoverId) {
            nexusHoverId = id;
            canvas.style.cursor = id ? "pointer" : "grab";
            nexusNeedsDraw = true;
            nexusStart();
        }
    });

    canvas.addEventListener("pointerup", (e) => {
        const wasClick = nexusPointerDown && !nexusPointerDown.moved && nexusPointerDown.node;
        const node = nexusPointerDown ? nexusPointerDown.node : null;
        nexusPointerDown = null;
        nexusDragNode = null;
        canvas.releasePointerCapture(e.pointerId);
        if (wasClick) nexusOpenNode(node);
        else nexusStart();
    });

    canvas.addEventListener("pointerleave", () => {
        if (nexusHoverId !== null) {
            nexusHoverId = null;
            nexusNeedsDraw = true;
            nexusStart();
        }
    });

    // Zoom toward the cursor, so the point under the pointer stays put.
    canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        nexusUserAdjusted = true;
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left - rect.width / 2;
        const py = e.clientY - rect.top - rect.height / 2;
        const before = nexusCamera.scale;
        const next = Math.min(4, Math.max(0.15, before * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        nexusCamera.x = px - ((px - nexusCamera.x) * next) / before;
        nexusCamera.y = py - ((py - nexusCamera.y) * next) / before;
        nexusCamera.scale = next;
        nexusNeedsDraw = true;
        nexusStart();
    }, { passive: false });

    window.addEventListener("resize", nexusResize);
}

// ---------- Load ----------

function nexusSeedPositions(nodes) {
    // Deterministic seeding (no Math.random) so the same data always
    // settles into the same shape - the layout is muscle memory, and a
    // graph that rearranges itself every visit throws that away.
    const roots = nodes.filter((n) => n.parent === null);
    const rootAngle = new Map();
    roots.forEach((r, i) => rootAngle.set(r.id, (i / roots.length) * Math.PI * 2));

    nodes.forEach((n, i) => {
        let angle;
        let radius;
        if (n.parent === null) {
            angle = rootAngle.get(n.id);
            radius = 120;
        } else {
            const rootId = n.rootId;
            angle = (rootAngle.get(rootId) || 0) + ((i % 13) - 6) * 0.12;
            radius = 150 + (n.depth || 1) * 60 + (i % 5) * 12;
        }
        n.x = Math.cos(angle) * radius;
        n.y = Math.sin(angle) * radius;
        n.vx = 0;
        n.vy = 0;
        n.index = i;
    });
}

async function loadNexus() {
    const resp = await fetch("/api/nexus/graph");
    const data = await resp.json();

    nexusNodes = data.nodes.map((n) => ({ ...n, x: 0, y: 0, vx: 0, vy: 0, degree: 0 }));
    nexusById = new Map(nexusNodes.map((n) => [n.id, n]));

    nexusLinks = data.edges
        .map((e) => ({ source: nexusById.get(e.source), target: nexusById.get(e.target) }))
        .filter((l) => l.source && l.target);

    for (const l of nexusLinks) {
        l.source.degree++;
        l.target.degree++;
    }

    // depth + owning root, used for seeding and (later) filtering.
    for (const n of nexusNodes) {
        let depth = 0;
        let cur = n;
        while (cur && cur.parent) {
            cur = nexusById.get(cur.parent);
            depth++;
            if (depth > 50) break;
        }
        n.depth = depth;
        n.rootId = cur ? cur.id : n.id;
    }

    nexusSeedPositions(nexusNodes);
    nexusWireCanvas();
    nexusResize();

    if (nexusPrefersReducedMotion()) {
        // Same layout, no flight: run the simulation to convergence in
        // one go and draw the settled result. Reduced motion should mean
        // less movement, not a worse graph.
        nexusAlpha = 1;
        for (let i = 0; i < 300 && nexusAlpha > NEXUS_ALPHA_MIN; i++) nexusTick();
        for (let i = 0; i < 40; i++) nexusFitToView();  // converge the lerp instantly
        nexusAlpha = 0;
        nexusNeedsDraw = true;
        nexusDraw();
    } else {
        nexusAlpha = 1;
        nexusStart();
    }
    nexusLoaded = true;
}

function refreshNexus() {
    if (!nexusLoaded) loadNexus();
    else { nexusResize(); }
}
