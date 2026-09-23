"""Institutional editorial labels, separate from the needs used in chat retrieval."""
from datetime import datetime, timezone

from . import models


def content_models(kind):
    return ((models.OrientationReferral, models.InstitutionReferralCategory)
            if kind == "referral" else (models.OrientationEvent, models.InstitutionEventCategory))


def content_rows(db, kind, institution_id):
    model, _ = content_models(kind)
    query = db.query(model).filter(model.institution_id == institution_id, model.is_active.is_(True), model.status == "certified")
    if kind == "event":
        return query.filter(model.ends_at >= datetime.now(timezone.utc)).order_by(model.starts_at, model.id)
    return query.order_by(model.sort_order, model.id)


def linked_categories(db, kind, content_ids, institution_id, *, active_only=True):
    if not content_ids:
        return {}
    model, link = content_models(kind)
    category = models.InstitutionOrientationCategory
    query = db.query(link.content_id, category.id).join(category, category.id == link.category_id).join(model, model.id == link.content_id).filter(
        link.content_id.in_(content_ids), category.institution_id == institution_id,
        model.institution_id == institution_id,
    )
    if active_only:
        query = query.filter(category.is_active.is_(True))
    result = {}
    for content_id, category_id in query.order_by(category.position, category.id).all():
        result.setdefault(content_id, []).append(category_id)
    return result


def directory_groups(db, institution_ids, referrals, events):
    """Enrich only rows that already passed the student visibility rules."""
    groups = []
    for institution_id in institution_ids:
        institution = db.get(models.Institution, institution_id)
        if not institution or not institution.is_active:
            continue
        group = {"institution": institution, "referrals": [], "events": []}
        used = set()
        for kind, items, key in (("referral", referrals, "referrals"), ("event", events, "events")):
            model, _ = content_models(kind)
            scoped = [item for item in items if item.get("institution_id") == institution_id]
            rows = content_rows(db, kind, institution_id).filter(model.slug.in_([item["id"] for item in scoped])).all()
            ids = {row.slug: row.id for row in rows}
            links = linked_categories(db, kind, list(ids.values()), institution_id)
            for item in scoped:
                # A concurrent administrative move must not expose stale labels.
                if item["id"] not in ids:
                    continue
                category_ids = links.get(ids[item["id"]], [])
                used.update(category_ids)
                group[key].append({**item, "category_ids": category_ids})
        group["categories"] = [
            {"id": row.id, "name": row.name, "description": row.description}
            for row in db.query(models.InstitutionOrientationCategory).filter(
                models.InstitutionOrientationCategory.id.in_(used),
                models.InstitutionOrientationCategory.institution_id == institution_id,
                models.InstitutionOrientationCategory.is_active.is_(True),
            ).order_by(models.InstitutionOrientationCategory.position, models.InstitutionOrientationCategory.id).all()
        ]
        groups.append(group)
    return groups
