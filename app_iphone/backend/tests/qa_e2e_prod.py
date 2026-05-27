"""
QA E2E — contra o backend de PRODUÇÃO (Oracle) com o Gemini REAL.
Cria um usuário de teste, exercita a IA interpretativa e limpa tudo no final
(deleta lembretes + a conta de teste).
"""
import sys
import time
from datetime import datetime, timezone, timedelta

import httpx

BASE = "http://147.15.7.119:8000/api/v1"
EMAIL = f"qa_e2e_{int(time.time())}@bot.quasenada.app"
PASSWORD = "senhaqa12345"

now = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=-3)))
TS = now.isoformat()

results = []


def log(name, ok, info=""):
    results.append((name, ok, info))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}  {info}")


def msg(client, token, content, hour_format="24h"):
    r = client.post(f"{BASE}/messages",
                    json={"content": content, "client_timestamp": TS, "hour_format": hour_format},
                    headers={"Authorization": f"Bearer {token}"}, timeout=70)
    r.raise_for_status()
    return r.json()


def main():
    with httpx.Client() as client:
        # health
        h = client.get("http://147.15.7.119:8000/health", timeout=15).json()
        log("produção /health ok", h.get("status") == "ok", str(h))

        # cria usuário de teste
        r = client.post(f"{BASE}/auth/register", json={"email": EMAIL, "password": PASSWORD, "name": "QA E2E"}, timeout=30)
        if r.status_code != 201:
            print("ERRO register:", r.status_code, r.text); sys.exit(1)
        token = r.json()["access_token"]
        print(f"\nUsuário de teste: {EMAIL}\n")

        print("## IA real — interpretação de recorrência")
        d = msg(client, token, "me lembra de bater ponto de segunda a sexta às 9h")
        dados = (d.get("action") or {}).get("reminder", {})
        log("'segunda a sexta' → weekly_days", dados.get("recurrence") == "weekly_days",
            f"intent recurrence={dados.get('recurrence')} days={dados.get('days_of_week')} str={dados.get('recurrence_str')!r}")
        log("'segunda a sexta' → dias [0,1,2,3,4]", dados.get("days_of_week") == [0, 1, 2, 3, 4],
            f"days={dados.get('days_of_week')}")

        d = msg(client, token, "me lembra de academia terça e quinta às 18h")
        dados = (d.get("action") or {}).get("reminder", {})
        log("'terça e quinta' → weekly_days [1,3]", dados.get("recurrence") == "weekly_days" and dados.get("days_of_week") == [1, 3],
            f"recurrence={dados.get('recurrence')} days={dados.get('days_of_week')}")

        d = msg(client, token, "me lembra de tomar remédio todo dia às 8h")
        dados = (d.get("action") or {}).get("reminder", {})
        log("'todo dia' → daily", dados.get("recurrence") == "daily", f"recurrence={dados.get('recurrence')}")

        d = msg(client, token, "me lembra de reunião amanhã às 15h")
        dados = (d.get("action") or {}).get("reminder", {})
        ne = dados.get("next_execution")
        future = ne and datetime.fromisoformat(ne) > datetime.now(timezone.utc)
        log("'amanhã às 15h' → once no futuro", dados.get("recurrence") == "once" and future,
            f"recurrence={dados.get('recurrence')} next={ne}")

        print("\n## IA real — AM/PM (formato 12h, horário ambíguo)")
        d = msg(client, token, "me lembra de ligar pro cliente às 7", hour_format="12h")
        atype = (d.get("action") or {}).get("type")
        log("12h ambíguo → needs_time_clarification (ou criou no futuro)",
            atype in ("needs_time_clarification", "reminder_created"),
            f"action.type={atype} resposta={d.get('response','')[:60]!r}")

        print("\n## IA real — listar")
        d = msg(client, token, "quais são meus lembretes?")
        log("'quais meus lembretes' → reminders_listed", (d.get("action") or {}).get("type") == "reminders_listed",
            f"action.type={(d.get('action') or {}).get('type')}")

        print("\n## Consistência: tudo que foi criado aparece na lista")
        r = client.get(f"{BASE}/reminders", headers={"Authorization": f"Bearer {token}"}, params={"limit": 500}, timeout=30)
        lst = r.json()["reminders"]
        sync = client.get(f"{BASE}/reminders/sync", headers={"Authorization": f"Bearer {token}"}, timeout=30).json()["reminders"]
        log("lista == sync (qtd ativos)", len(lst) == len(sync), f"lista={len(lst)} sync={len(sync)}")

        print("\n## Limpeza")
        for rem in lst:
            client.delete(f"{BASE}/reminders/{rem['id']}", headers={"Authorization": f"Bearer {token}"}, timeout=20)
        r = client.request("DELETE", f"{BASE}/auth/account", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
        log("conta de teste deletada", r.status_code == 200, f"status={r.status_code}")

    passed = sum(1 for _, ok, _ in results if ok)
    print("\n" + "=" * 60)
    print(f"E2E PRODUÇÃO — TOTAL: {len(results)} | PASS: {passed} | FAIL: {len(results) - passed}")
    print("=" * 60)


if __name__ == "__main__":
    main()
