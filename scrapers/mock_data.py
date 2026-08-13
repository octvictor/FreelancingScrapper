"""Realistic-looking fake data for Safe mode (MOCK_MODE).

Every scraper returns this instead of touching a real site when Safe
mode is on, so the whole app can be clicked through with no login, no
network call, and zero risk to a real account. This is the default mode;
real scraping is an explicit opt-in per run.
"""
from __future__ import annotations

import random

_STUDIOS = [
    "Nomad Render Collective", "Polybrush Studio", "Voxel Foundry",
    "Aurora CG Works", "Ironclad Animation", "Driftwood 3D",
    "Halcyon Pixel Lab", "Kinetic Sculpt Studio", "Basalt Render House",
    "Loom & Light Studio", "Cascade CG", "Nightfall Motion",
]
_FIRST_NAMES = ["Alex", "Sam", "Jordan", "Riley", "Casey", "Morgan", "Taylor", "Jamie", "Quinn", "Avery"]
_LAST_NAMES = ["Chen", "Okafor", "Petrov", "Nakamura", "Silva", "Kowalski", "Haddad", "Novak", "Reyes", "Larsen"]
_TITLES = [
    "3D Artist", "Senior 3D Artist", "CG Generalist", "Character Artist",
    "Environment Artist", "Lead 3D Artist", "Technical Artist", "3D Animator",
]
_LOCATIONS = ["Remote", "Los Angeles, CA", "London, UK", "Vancouver, BC", "Berlin, Germany", "Austin, TX"]
_HIRING_BIOS = [
    "We're hiring 3D artists - check the link in bio for open roles.",
    "CG studio based remotely. Now hiring: mid/senior 3D generalists.",
    "Open position: Character Artist. Join our team - link below.",
]
_NON_HIRING_BIOS = [
    "Independent CG studio. Client work + personal projects.",
    "Small team, big renders. Based in the cloud.",
    "3D/CG collective. DM for collabs.",
]


def linkedin_leads(count: int) -> list[dict]:
    rng = random.Random(42)
    results = []
    for i in range(count):
        first, last = rng.choice(_FIRST_NAMES), rng.choice(_LAST_NAMES)
        slug = f"{first.lower()}-{last.lower()}-{i:03d}"
        results.append(
            {
                "name": f"{first} {last}",
                "title": rng.choice(_TITLES),
                "company_name": rng.choice(_STUDIOS),
                "location": rng.choice(_LOCATIONS),
                "profile_url": f"https://www.linkedin.com/in/{slug}",
            }
        )
    return results


def instagram_profiles(usernames: list[str]) -> list[dict]:
    rng = random.Random(7)
    results = []
    for username in usernames:
        is_hiring = rng.random() < 0.4
        bio = rng.choice(_HIRING_BIOS) if is_hiring else rng.choice(_NON_HIRING_BIOS)
        results.append(
            {
                "username": username,
                "full_name": username.replace("_", " ").replace(".", " ").title(),
                "bio": bio,
                "external_link": f"https://{username}.com" if rng.random() < 0.6 else "",
                "is_hiring": is_hiring,
                "profile_url": f"https://www.instagram.com/{username}/",
            }
        )
    return results


def instagram_hashtag_posts(tag: str, max_posts: int) -> list[dict]:
    return [{"post_url": f"https://www.instagram.com/p/mock{tag}{i:03d}/", "hashtag": tag} for i in range(max_posts)]
