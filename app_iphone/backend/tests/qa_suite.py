"""
QA SUITE (local, determinística) — camadas Unit + API.
Roda contra um DB temporário e mocka o Gemini para testar a orquestração.
Não toca produção. Gera um relatório PASS/FAIL ao final.
"""
import os
import asyncio
from datetime import datetime, timezone, timedelta

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./qa_test.db"
os.environ.setdefault("JWT_SECRET", "x" * 40)
os.environ.setdefault("GOOGLE_API_KEY", "dummy-key")

if os.path.exists("qa_test.db"):
    os.remove("qa_test.db")

from fastapi.testclient import TestClient  # noqa: E402
import src.features.messages.service as msgsvc  # noqa: E402
from src.main import app, _run_migrations  # noqa: E402
from src.models.models import Reminder  # noqa: E402
from src.features.reminders.service import (  # noqa: E402
    calcular_proxima_execucao,
    calcular_execucoes_futuras,
    _roll_forward_to_future,
    _weekly_days_label,
    _parse_days,
)

RESULTS = []


def check(name, cond, detail=""):
    RESULTS.append((name, bool(cond), detail))


def section(title):
    RESULTS.append((f"__SECTION__{title}", None, ""))


async def _migrate():
    from src.core.database import engine, Base
    import src.models.models  # noqa
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _run_migrations()


asyncio.run(_migrate())

NOW = datetime(2026, 5, 26, 12, 0, tzinfo=timezone.utc)  # terça


def R(**kw):
    kw.setdefault("interval_seconds", None)
    kw.setdefault("end_date", None)
    kw.setdefault("days_of_week", None)
    return Reminder(**kw)


# ───────────────────────── CAMADA 1: lógica de recorrência ─────────────────────────
section("Unit — recorrência e roll-forward")

r = R(recurrence="daily")
nd = calcular_proxima_execucao(r, NOW)
check("daily avança 1 dia", nd == NOW + timedelta(days=1), str(nd))

r = R(recurrence="weekly")
nd = calcular_proxima_execucao(r, NOW)
check("weekly avança 7 dias", nd == NOW + timedelta(weeks=1), str(nd))

r = R(recurrence="interval_seconds", interval_seconds=3600)
nd = calcular_proxima_execucao(r, NOW)
check("interval_seconds avança 1h", nd == NOW + timedelta(hours=1), str(nd))

r = R(recurrence="once")
check("once não recorre (None)", calcular_proxima_execucao(r, NOW) is None)

r = R(recurrence="weekly_days", days_of_week="0,1,2,3,4")  # seg-sex; NOW=terça
nd = calcular_proxima_execucao(r, NOW)
check("weekly_days seg-sex de terça → quarta", nd.weekday() == 2, str(nd))

r = R(recurrence="weekly_days", days_of_week="1,3")  # ter/qui; NOW=terça
nd = calcular_proxima_execucao(r, NOW)
check("weekly_days ter/qui de terça → quinta", nd.weekday() == 3, str(nd))

r = R(recurrence="weekly_days", days_of_week="0,1,2,3,4")  # de sexta pula fds
sexta = datetime(2026, 5, 29, 9, 0, tzinfo=timezone.utc)
nd = calcular_proxima_execucao(r, sexta)
check("weekly_days seg-sex de sexta → segunda", nd.weekday() == 0, str(nd))

# roll-forward
r = R(recurrence="once")
past = datetime(2026, 5, 26, 8, 0, tzinfo=timezone.utc)
check("roll-forward once passado → +1 dia mesma hora",
      _roll_forward_to_future(r, past, NOW) == datetime(2026, 5, 27, 8, 0, tzinfo=timezone.utc))
fut = datetime(2026, 5, 26, 20, 0, tzinfo=timezone.utc)
check("roll-forward once futuro inalterado", _roll_forward_to_future(r, fut, NOW) == fut)

# labels
check("label seg-sex = Dias úteis", _weekly_days_label([0, 1, 2, 3, 4]) == "Dias úteis")
check("label fim de semana", _weekly_days_label([5, 6]) == "Fim de semana")
check("label ter/qui", _weekly_days_label([1, 3]) == "Ter, Qui")
check("label todos = Todos os dias", _weekly_days_label([0, 1, 2, 3, 4, 5, 6]) == "Todos os dias")

# parse
check("parse CSV '0,1,2'", _parse_days("0,1,2") == [0, 1, 2])
check("parse lista [3,1]", _parse_days([3, 1]) == [1, 3])
check("parse None → []", _parse_days(None) == [])
check("parse inválidos filtrados", _parse_days("9,abc,2") == [2])

# execuções futuras só em dias válidos
r = R(recurrence="weekly_days", days_of_week="0,1,2,3,4", is_active=1,
      next_execution=datetime(2026, 5, 27, 9, 0, tzinfo=timezone.utc).isoformat())
ex = calcular_execucoes_futuras(r, horizon_days=21, max_per_reminder=10)
dows = {datetime.fromisoformat(e).weekday() for e in ex}
check("execuções futuras só dias úteis", dows <= {0, 1, 2, 3, 4}, str(sorted(dows)))


# ───────────────────────── CAMADA 2: API ─────────────────────────
def fake_intent(payload):
    async def _f(user_message, current_datetime, hour_format="24h"):
        return {**payload, "_model_used": "fake"}
    return _f


async def fake_chat(user_message, history=None):
    return ("resposta de chat geral (fake)", "fake-model")


msgsvc.chat_general = fake_chat

with TestClient(app) as c:
    section("API — autenticação")
    r = c.post("/api/v1/auth/register", json={"email": "qa@bot.quasenada.app", "password": "senha12345", "name": "QA"})
    check("register 201", r.status_code == 201, r.text[:120])
    if r.status_code != 201:
        r = c.post("/api/v1/auth/login", json={"email": "qa@bot.quasenada.app", "password": "senha12345"})
    tok = r.json().get("access_token")
    H = {"Authorization": f"Bearer {tok}"}
    check("token recebido", bool(tok))
    check("login funciona", c.post("/api/v1/auth/login", json={"email": "qa@bot.quasenada.app", "password": "senha12345"}).status_code == 200)
    check("senha errada → 401", c.post("/api/v1/auth/login", json={"email": "qa@bot.quasenada.app", "password": "errada99"}).status_code == 401)
    check("reminders sem auth → 401/403", c.get("/api/v1/reminders").status_code in (401, 403))

    section("API — CRUD de lembretes")
    r = c.post("/api/v1/reminders", json={"title": "Pagar conta", "scheduled_time": "2030-01-01T10:00:00+00:00", "recurrence": "once"}, headers=H)
    check("criar once → 201", r.status_code == 201, r.text[:120])
    once_id = r.json()["id"]
    check("once recurrence_str = Único", r.json()["recurrence_str"] == "Único", r.json().get("recurrence_str"))

    r = c.post("/api/v1/reminders", json={"title": "Remédio", "scheduled_time": "2030-01-01T08:00:00+00:00", "recurrence": "daily"}, headers=H)
    check("criar daily → 201", r.status_code == 201)
    check("daily recurrence_str = Diariamente", r.json()["recurrence_str"] == "Diariamente")

    r = c.patch(f"/api/v1/reminders/{once_id}", json={"title": "Pagar aluguel"}, headers=H)
    check("editar título → 200", r.status_code == 200 and r.json()["title"] == "Pagar aluguel", r.text[:120])

    r = c.patch(f"/api/v1/reminders/{once_id}", json={"scheduled_time": "2031-02-03T15:30:00+00:00"}, headers=H)
    check("editar horário → 200", r.status_code == 200 and r.json()["next_execution"].startswith("2031-02-03T15:30"), r.json().get("next_execution"))

    r = c.get("/api/v1/reminders", headers=H)
    check("listar inclui os criados", r.status_code == 200 and any(x["id"] == once_id for x in r.json()["reminders"]))

    r = c.delete(f"/api/v1/reminders/{once_id}", headers=H)
    check("deletar → 200", r.status_code == 200)
    r = c.get("/api/v1/reminders", headers=H)
    check("deletado some da lista", all(x["id"] != once_id for x in r.json()["reminders"]))

    section("API — weekly_days + sync")
    r = c.post("/api/v1/reminders", json={"title": "Bater ponto", "scheduled_time": "2020-01-01T09:00:00+00:00", "recurrence": "weekly_days", "days_of_week": [0, 1, 2, 3, 4]}, headers=H)
    wd_id = r.json()["id"]
    check("criar weekly_days → 201", r.status_code == 201)
    check("weekly_days rótulo = Dias úteis", r.json()["recurrence_str"] == "Dias úteis")
    check("weekly_days roll-forward p/ futuro", datetime.fromisoformat(r.json()["next_execution"]) > datetime.now(timezone.utc))
    check("weekly_days 1ª exec é dia útil", datetime.fromisoformat(r.json()["next_execution"]).weekday() in {0, 1, 2, 3, 4})

    r = c.get("/api/v1/reminders/sync", headers=H)
    item = next((i for i in r.json()["reminders"] if i["id"] == wd_id), None)
    check("sync retorna recurrence", item and item.get("recurrence") == "weekly_days")
    dows = {datetime.fromisoformat(e).weekday() for e in item["scheduled_executions"]}
    check("sync execuções só dias úteis", dows <= {0, 1, 2, 3, 4}, str(sorted(dows)))

    r = c.patch(f"/api/v1/reminders/{wd_id}", json={"days_of_week": [1, 3]}, headers=H)
    check("editar dias → Ter, Qui", r.status_code == 200 and r.json()["recurrence_str"] == "Ter, Qui", r.text[:120])
    check("editar dias recalcula execução p/ ter/qui", datetime.fromisoformat(r.json()["next_execution"]).weekday() in {1, 3})

    section("API — roll-forward na criação")
    r = c.post("/api/v1/reminders", json={"title": "Café", "scheduled_time": "2020-06-01T08:00:00+00:00", "recurrence": "once"}, headers=H)
    check("once no passado → next_execution futuro", datetime.fromisoformat(r.json()["next_execution"]) > datetime.now(timezone.utc), r.json().get("next_execution"))

    section("API — /messages (orquestração, Gemini mockado)")
    msgsvc.classify_intent = fake_intent({"intencao": "CRIAR_LEMBRETE", "dados": {"titulo": "Reunião", "data_hora": "2030-05-01T14:00:00+00:00", "recorrencia": "once"}})
    r = c.post("/api/v1/messages", json={"content": "x", "client_timestamp": "2026-05-26T12:00:00-03:00", "hour_format": "24h"}, headers=H)
    check("CRIAR_LEMBRETE → action reminder_created", r.json()["action"]["type"] == "reminder_created", str(r.json().get("action"))[:120])
    check("CRIAR_LEMBRETE → resposta 'criado'", "criado" in r.json()["response"].lower())

    msgsvc.classify_intent = fake_intent({"intencao": "CRIAR_LEMBRETE", "dados": {"titulo": "Dentista", "data_hora": "2030-05-01T09:00:00+00:00", "recorrencia": "once", "precisa_ampm": True, "hora_ambigua": "9:00"}})
    r = c.post("/api/v1/messages", json={"content": "me lembra do dentista às 9h", "client_timestamp": "2026-05-26T12:00:00-03:00", "hour_format": "12h"}, headers=H)
    check("AM/PM ambíguo → needs_time_clarification", r.json()["action"]["type"] == "needs_time_clarification", str(r.json().get("action"))[:120])
    check("AM/PM → 2 opções (manhã/noite)", len(r.json()["action"].get("options", [])) == 2)

    msgsvc.classify_intent = fake_intent({"intencao": "LISTAR_LEMBRETES", "dados": {}})
    r = c.post("/api/v1/messages", json={"content": "meus lembretes", "client_timestamp": "2026-05-26T12:00:00-03:00"}, headers=H)
    check("LISTAR → action reminders_listed", r.json()["action"]["type"] == "reminders_listed")

    msgsvc.classify_intent = fake_intent({"intencao": "EDITAR_LEMBRETE", "dados": {"titulo_busca": "Bater ponto", "novo_titulo": None, "nova_data_hora": "2030-08-08T07:00:00+00:00"}})
    r = c.post("/api/v1/messages", json={"content": "muda bater ponto", "client_timestamp": "2026-05-26T12:00:00-03:00"}, headers=H)
    check("EDITAR (1 match) → reminder_updated", r.json()["action"]["type"] == "reminder_updated", str(r.json().get("action"))[:120])

    msgsvc.classify_intent = fake_intent({"intencao": "DELETAR_LEMBRETE", "dados": {"titulo_busca": "Bater ponto"}})
    r = c.post("/api/v1/messages", json={"content": "apaga bater ponto", "client_timestamp": "2026-05-26T12:00:00-03:00"}, headers=H)
    check("DELETAR (1 match) → reminder_deleted", r.json()["action"]["type"] == "reminder_deleted", str(r.json().get("action"))[:120])

    msgsvc.classify_intent = fake_intent({"intencao": "CHAT_GERAL", "dados": {}})
    r = c.post("/api/v1/messages", json={"content": "oi", "client_timestamp": "2026-05-26T12:00:00-03:00"}, headers=H)
    check("CHAT_GERAL → sem action + resposta do chat", r.json()["action"] is None and "fake" in r.json()["response"], str(r.json())[:120])

    section("API — cap de listagem (consistência com sync)")
    for i in range(55):
        c.post("/api/v1/reminders", json={"title": f"R{i}", "scheduled_time": "2030-01-01T09:00:00+00:00", "recurrence": "daily"}, headers=H)
    r = c.get("/api/v1/reminders", headers=H)
    total = r.json()["total"]
    listed = len(r.json()["reminders"])
    check("lista traz >50 (cap antigo era 50)", listed > 50, f"listados={listed} total={total}")
    rs = c.get("/api/v1/reminders/sync", headers=H)
    check("sync e lista batem em quantidade de ativos", listed == len(rs.json()["reminders"]), f"lista={listed} sync={len(rs.json()['reminders'])}")

    section("API — push register (scaffolding)")
    r = c.post("/api/v1/push/register", json={"token": "ExpoTok[abc123]", "platform": "ios"}, headers=H)
    check("push/register → 204", r.status_code == 204, r.text[:120])


# ───────────────────────── RELATÓRIO ─────────────────────────
print("\n" + "=" * 64)
print("RELATÓRIO DE QA — Backend (Unit + API, Gemini mockado)")
print("=" * 64)
passed = failed = 0
for name, ok, detail in RESULTS:
    if name.startswith("__SECTION__"):
        print(f"\n## {name.replace('__SECTION__', '')}")
        continue
    if ok:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        print(f"  FAIL  {name}  -> {detail}")
print("\n" + "-" * 64)
print(f"TOTAL: {passed + failed} | PASS: {passed} | FAIL: {failed}")
print("=" * 64)
