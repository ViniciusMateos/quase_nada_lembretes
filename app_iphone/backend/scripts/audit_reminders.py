"""
Auditoria e limpeza de lembretes "presos"/duplicados.

Por padrão roda em modo SOMENTE-LEITURA (auditoria) e só imprime o que encontrou.
Use --fix para aplicar a limpeza (ação destrutiva — leia o relatório antes).

Uso:
    python -m scripts.audit_reminders            # auditoria (read-only)
    python -m scripts.audit_reminders --fix      # aplica a limpeza

Detecta:
  1. Duplicatas EXATAS ativas: mesmo (user_id, title_normalized, recurrence,
     next_execution). São agendadas múltiplas vezes pelo /sync e disparam em
     duplicidade. --fix mantém a mais antiga (created_at) e remove as demais.
  2. Lembretes 'once' ativos com next_execution no passado: deveriam estar
     inativos (o /sync e a listagem desativam, mas linhas presas podem existir).
     --fix desativa (is_active=0).
  3. Recorrentes ativos com next_execution no passado ("presos"): o scheduler
     deveria avançá-los; o relatório aponta para investigação.
"""

import argparse
import asyncio
import os
from datetime import datetime, timezone

import aiosqlite
from dotenv import load_dotenv

load_dotenv()


def extract_db_path(url: str) -> str:
    relative_prefix = "sqlite+aiosqlite:///"
    absolute_prefix = "sqlite+aiosqlite:////"
    if url == "sqlite+aiosqlite:///:memory:":
        return ":memory:"
    if url.startswith(absolute_prefix):
        return "/" + url[len(absolute_prefix):]
    if url.startswith(relative_prefix):
        return url[len(relative_prefix):]
    raise ValueError("DATABASE_URL inesperado. Esperado sqlite+aiosqlite:///caminho.db")


def _parse_dt(value: str) -> datetime | None:
    try:
        dt = datetime.fromisoformat(value)
    except (ValueError, TypeError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


async def audit(db_path: str, fix: bool) -> None:
    now = datetime.now(timezone.utc)
    print(f"Banco: {db_path}")
    print(f"Agora (UTC): {now.isoformat()}")
    print(f"Modo: {'LIMPEZA (--fix)' if fix else 'AUDITORIA (read-only)'}")
    print("-" * 60)

    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row

        total = (await (await db.execute("SELECT COUNT(*) c FROM reminders")).fetchone())["c"]
        ativos = (await (await db.execute("SELECT COUNT(*) c FROM reminders WHERE is_active=1")).fetchone())["c"]
        print(f"Total: {total} | Ativos: {ativos} | Inativos: {total - ativos}")
        print("-" * 60)

        # 1. Duplicatas exatas ativas
        dup_rows = await (await db.execute(
            """
            SELECT user_id, title_normalized, recurrence, next_execution,
                   COUNT(*) c, GROUP_CONCAT(id) ids, MIN(created_at) keep_created
            FROM reminders
            WHERE is_active = 1
            GROUP BY user_id, title_normalized, recurrence, next_execution
            HAVING COUNT(*) > 1
            """
        )).fetchall()

        removidos = 0
        print(f"[1] Grupos de duplicatas EXATAS ativas: {len(dup_rows)}")
        for r in dup_rows:
            ids = r["ids"].split(",")
            print(f"    - '{r['title_normalized']}' ({r['recurrence']}) "
                  f"@ {r['next_execution']} → {r['c']} cópias: {ids}")
            if fix:
                # mantém a mais antiga (MIN created_at), remove as outras
                keep_row = await (await db.execute(
                    """
                    SELECT id FROM reminders
                    WHERE user_id=? AND title_normalized=? AND
                          IFNULL(recurrence,'')=IFNULL(?,'') AND next_execution=? AND is_active=1
                    ORDER BY created_at ASC LIMIT 1
                    """,
                    (r["user_id"], r["title_normalized"], r["recurrence"], r["next_execution"]),
                )).fetchone()
                keep_id = keep_row["id"]
                to_delete = [i for i in ids if i != keep_id]
                for did in to_delete:
                    await db.execute("DELETE FROM reminders WHERE id=?", (did,))
                    removidos += 1
                print(f"      mantido {keep_id}, removidos {len(to_delete)}")

        print("-" * 60)

        # 2. 'once' ativos no passado
        once_rows = await (await db.execute(
            "SELECT id, title, next_execution FROM reminders "
            "WHERE is_active=1 AND IFNULL(recurrence,'once')='once'"
        )).fetchall()
        once_passados = [row for row in once_rows if (d := _parse_dt(row["next_execution"])) and d < now]
        print(f"[2] 'once' ativos no passado: {len(once_passados)}")
        desativados = 0
        for row in once_passados:
            print(f"    - {row['id']} '{row['title']}' @ {row['next_execution']}")
            if fix:
                await db.execute(
                    "UPDATE reminders SET is_active=0, updated_at=? WHERE id=?",
                    (now.isoformat(), row["id"]),
                )
                desativados += 1

        print("-" * 60)

        # 3. Recorrentes ativos presos no passado (apenas relatório)
        rec_rows = await (await db.execute(
            "SELECT id, title, recurrence, next_execution FROM reminders "
            "WHERE is_active=1 AND recurrence IS NOT NULL AND recurrence <> 'once'"
        )).fetchall()
        rec_presos = [row for row in rec_rows if (d := _parse_dt(row["next_execution"])) and d < now]
        print(f"[3] Recorrentes ativos presos no passado: {len(rec_presos)} "
              f"(o scheduler deveria avançá-los — investigar se persistir)")
        for row in rec_presos:
            print(f"    - {row['id']} '{row['title']}' ({row['recurrence']}) @ {row['next_execution']}")

        if fix:
            await db.commit()
            print("-" * 60)
            print(f"LIMPEZA aplicada: {removidos} duplicata(s) removida(s), "
                  f"{desativados} 'once' desativado(s).")
        else:
            print("-" * 60)
            print("Nenhuma alteração feita (use --fix para aplicar).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Auditoria/limpeza de lembretes presos/duplicados.")
    parser.add_argument("--fix", action="store_true", help="aplica a limpeza (destrutivo)")
    args = parser.parse_args()

    database_url = os.environ["DATABASE_URL"]
    asyncio.run(audit(extract_db_path(database_url), args.fix))
