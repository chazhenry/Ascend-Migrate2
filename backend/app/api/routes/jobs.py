import asyncio
from uuid import UUID

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.api.deps import CurrentUserOrQueryToken, DBSession
from app.core.errors import APIError
from app.models.job import Job


router = APIRouter(prefix="/jobs", tags=["jobs"])


async def _stream_job_log(db: DBSession, job_id: UUID):
    last_sent = ""
    while True:
        result = await db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()
        if not job:
            break
        if job.log != last_sent:
            new_text = job.log[len(last_sent):].lstrip("\n")
            if new_text:
                for line in new_text.splitlines():
                    yield f"data: {line}\n\n"
            last_sent = job.log
        if job.status in {"complete", "failed"}:
            yield f"event: done\ndata: {job.status}\n\n"
            break
        await asyncio.sleep(1)


@router.get("/{job_id}/log")
async def stream_job_log(job_id: UUID, _: CurrentUserOrQueryToken, db: DBSession) -> StreamingResponse:
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise APIError("Job not found.", "job_not_found", 404)
    return StreamingResponse(_stream_job_log(db, job_id), media_type="text/event-stream")
