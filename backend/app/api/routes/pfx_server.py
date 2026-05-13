import asyncio
import time
from typing import Any

import pyodbc

pyodbc.pooling = False  # prevent ODBC from holding connections open between calls

from fastapi import APIRouter

from app.core.config import get_settings
from app.core.errors import APIError

router = APIRouter(prefix="/pfx", tags=["PFx Server"])
settings = get_settings()

SNAPSHOT_NAME = "PFx_Master_Snap"


def _get_connection(autocommit: bool = False) -> pyodbc.Connection:
    conn_str = (
        "DRIVER={SQL Server};"
        f"SERVER={settings.sqlserver_host},{settings.sqlserver_port};"
        f"DATABASE={settings.sqlserver_db};"
        f"UID={settings.sqlserver_user};"
        f"PWD={settings.sqlserver_password};"
    )
    conn = pyodbc.connect(conn_str, autocommit=autocommit)
    return conn


def _do_revert() -> dict[str, str]:
    conn_str = (
        "DRIVER={SQL Server};"
        f"SERVER={settings.sqlserver_host},{settings.sqlserver_port};"
        "DATABASE=master;"
        f"UID={settings.sqlserver_user};"
        f"PWD={settings.sqlserver_password};"
    )
    restore_sql = f"RESTORE DATABASE [{settings.sqlserver_db}] FROM DATABASE_SNAPSHOT = N'{SNAPSHOT_NAME}'"
    with pyodbc.connect(conn_str, autocommit=True) as conn:
        cursor = conn.cursor()
        cursor.execute("USE [master]")
        cursor.execute(
            """
            SELECT spid
            FROM master.dbo.sysprocesses
            WHERE dbid = DB_ID(?) AND spid <> @@SPID
            """,
            settings.sqlserver_db,
        )
        for row in cursor.fetchall():
            cursor.execute(f"KILL {int(row[0])}")
        for _ in range(20):
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM master.dbo.sysprocesses
                WHERE dbid = DB_ID(?) AND spid <> @@SPID
                """,
                settings.sqlserver_db,
            )
            active_sessions = int(cursor.fetchone()[0])
            if active_sessions == 0:
                break
            time.sleep(0.25)
        cursor.execute(restore_sql)
    return {"message": f"Database [{settings.sqlserver_db}] restored from snapshot '{SNAPSHOT_NAME}'."}


def _do_status() -> dict[str, Any]:
    sql = """
        SELECT
            d.name,
            d.state_desc,
            d.recovery_model_desc,
            d.compatibility_level,
            d.create_date,
            d.is_read_only,
            d.snapshot_isolation_state_desc,
            CAST(SUM(mf.size) * 8.0 / 1024 AS DECIMAL(10,2)) AS size_mb
        FROM sys.databases d
        JOIN sys.master_files mf ON d.database_id = mf.database_id
        WHERE d.name = ?
        GROUP BY
            d.name, d.state_desc, d.recovery_model_desc,
            d.compatibility_level, d.create_date,
            d.is_read_only, d.snapshot_isolation_state_desc
    """
    snap_sql = """
        SELECT name, create_date, source_database_id
        FROM sys.databases
        WHERE source_database_id = DB_ID(?)
    """
    with _get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(sql, settings.sqlserver_db)
        row = cursor.fetchone()
        if row is None:
            raise APIError(f"Database '{settings.sqlserver_db}' not found on server.", "not_found", 404)
        db_info = {
            "name": row[0],
            "state": row[1],
            "recovery_model": row[2],
            "compatibility_level": row[3],
            "created": str(row[4]),
            "is_read_only": bool(row[5]),
            "snapshot_isolation": row[6],
            "size_mb": float(row[7]),
        }
        cursor.execute(snap_sql, settings.sqlserver_db)
        snapshots = [{"name": r[0], "created": str(r[1])} for r in cursor.fetchall()]
        db_info["snapshots"] = snapshots
        cursor.execute("SELECT COUNT(*) FROM dbo.client")
        count_row = cursor.fetchone()
        db_info["client_row_count"] = int(count_row[0]) if count_row else 0
    return db_info


def _do_write_test() -> dict[str, Any]:
    import datetime
    now = datetime.datetime.utcnow()
    # Pick a CLIENTIDENT unlikely to collide
    test_ident = 999_000_000 + int(now.timestamp()) % 1_000_000
    insert_sql = """
        INSERT INTO dbo.client (
            CLIENTIDENT, CLIENTID, CLIENTSORTNAME, CLIENTTYPE,
            CLIENTSTATUS, DELETEFLAG, CREATEDDATETIME, LASTUPDATEDDATETIME
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """
    with _get_connection(autocommit=True) as conn:
        cursor = conn.cursor()
        cursor.execute(
            insert_sql,
            test_ident,
            f"TEST-{test_ident}",
            "Copilot Write Test",
            "Test",
            "Active",
            "N",
            now,
            now,
        )
        cursor.execute("SELECT COUNT(*) FROM dbo.client")
        total = int(cursor.fetchone()[0])
    return {
        "message": f"Test record inserted (CLIENTIDENT={test_ident}).",
        "client_row_count": total,
    }


@router.post("/revert")
async def revert_database() -> dict[str, str]:
    try:
        result = await asyncio.get_event_loop().run_in_executor(None, _do_revert)
    except APIError:
        raise
    except pyodbc.Error as exc:
        raise APIError(f"SQL Server error: {exc.args[-1]}", "sqlserver_error", 500) from exc
    return result


@router.get("/status")
async def database_status() -> dict[str, Any]:
    try:
        result = await asyncio.get_event_loop().run_in_executor(None, _do_status)
    except APIError:
        raise
    except pyodbc.Error as exc:
        raise APIError(f"SQL Server error: {exc.args[-1]}", "sqlserver_error", 500) from exc
    return result


@router.post("/write-test")
async def write_test() -> dict[str, Any]:
    try:
        result = await asyncio.get_event_loop().run_in_executor(None, _do_write_test)
    except APIError:
        raise
    except pyodbc.Error as exc:
        raise APIError(f"SQL Server error: {exc.args[-1]}", "sqlserver_error", 500) from exc
    return result
