"""
Bot do Telegram — Quase Nada Lembretes.

Agora é um CLIENTE do backend FastAPI do app: usa a MESMA IA, a MESMA lógica de
recorrência (incl. dias da semana) e o MESMO banco. O bot não tem mais IA/DB/
agendamento próprios — ele só faz a ponte entre o Telegram e a API.

- Auth por chat_id: cada chat vira um usuário no backend (registrado/logado
  automaticamente), com tokens guardados localmente em tg_sessions.json.
- Mensagens: POST /api/v1/messages (mesma IA do app).
- Disparo: o backend não envia push; o bot consulta /api/v1/reminders/sync
  periodicamente e dispara a mensagem no Telegram no horário certo.
- Adiar (5/10 min): recorrente → reenvio local pontual (não mexe na recorrência);
  pontual → cria um novo lembrete no backend (+5/+10).

Variáveis de ambiente:
  TELEGRAM_TOKEN  — token do bot
  BACKEND_URL     — base do backend (default http://127.0.0.1:8000)
"""
import os
import json
import logging
import secrets
from datetime import datetime, timezone, timedelta

import httpx
from dotenv import load_dotenv
from pytz import timezone as pytz_timezone
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    filters,
    ContextTypes,
)

load_dotenv()

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
API = f"{BACKEND_URL}/api/v1"
FUSO_HORARIO_LOCAL = pytz_timezone("America/Sao_Paulo")
SESSIONS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tg_sessions.json")

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


# ──────────────────────────── Sessões por chat_id ────────────────────────────
def _load_sessions() -> dict:
    try:
        with open(SESSIONS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_sessions(data: dict) -> None:
    with open(SESSIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f)


def _get_session(chat_id) -> dict | None:
    return _load_sessions().get(str(chat_id))


def _put_session(chat_id, sess: dict) -> None:
    data = _load_sessions()
    data[str(chat_id)] = sess
    _save_sessions(data)


async def _ensure_session(chat_id) -> dict:
    """Garante credenciais + token válido para o chat. Registra/loga se preciso."""
    sess = _get_session(chat_id)
    if sess and sess.get("access_token"):
        return sess

    if not sess:
        sess = {
            "email": f"tg{chat_id}@telegrambot.quasenada.app",
            "password": secrets.token_urlsafe(18),
        }

    async with httpx.AsyncClient(timeout=30) as client:
        reg = await client.post(
            f"{API}/auth/register",
            json={"email": sess["email"], "password": sess["password"], "name": f"Telegram {chat_id}"},
        )
        if reg.status_code == 201:
            data = reg.json()
        else:
            login = await client.post(
                f"{API}/auth/login",
                json={"email": sess["email"], "password": sess["password"]},
            )
            login.raise_for_status()
            data = login.json()

    sess["access_token"] = data["access_token"]
    sess["refresh_token"] = data["refresh_token"]
    _put_session(chat_id, sess)
    return sess


async def _api_call(chat_id, method, path, json_body=None, params=None):
    """Chamada autenticada à API, com refresh/relogin em 401."""
    sess = await _ensure_session(chat_id)

    async def _do(token):
        async with httpx.AsyncClient(timeout=90) as client:
            return await client.request(
                method,
                f"{API}{path}",
                json=json_body,
                params=params,
                headers={"Authorization": f"Bearer {token}"},
            )

    resp = await _do(sess["access_token"])

    if resp.status_code == 401:
        # tenta refresh; se falhar, força re-login
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                rr = await client.post(f"{API}/auth/refresh", json={"refresh_token": sess.get("refresh_token", "")})
            if rr.status_code == 200:
                d = rr.json()
                sess["access_token"] = d["access_token"]
                sess["refresh_token"] = d["refresh_token"]
                _put_session(chat_id, sess)
            else:
                raise RuntimeError("refresh falhou")
        except Exception:
            sess.pop("access_token", None)
            _put_session(chat_id, sess)
            sess = await _ensure_session(chat_id)
        resp = await _do(sess["access_token"])

    resp.raise_for_status()
    if resp.status_code == 204 or not resp.content:
        return None
    return resp.json()


# ──────────────────────────── Handlers do Telegram ────────────────────────────
async def comando_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_html(
        "👋 <b>Oi! Eu sou o Quase Nada Lembretes.</b>\n\n"
        "É só me dizer o que quer lembrar, em linguagem natural. Exemplos:\n"
        "• <i>me lembra de pagar a conta amanhã às 10h</i>\n"
        "• <i>me lembra de bater ponto de segunda a sexta às 9h</i>\n"
        "• <i>quais são meus lembretes?</i>"
    )


async def lidar_com_audio_rejeitado(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_html(
        "🔴 <b>AVISO</b>\n\n"
        "Só consigo processar lembretes por mensagem de <b>TEXTO</b>.\n"
        "Por favor, <b>DIGITE</b> o que você precisa."
    )


async def _processar_texto(update: Update, context: ContextTypes.DEFAULT_TYPE, conteudo: str) -> None:
    chat_id = update.effective_chat.id
    client_ts = datetime.now(FUSO_HORARIO_LOCAL).isoformat()

    await context.bot.send_chat_action(chat_id=chat_id, action="typing")

    try:
        data = await _api_call(
            chat_id,
            "POST",
            "/messages",
            json_body={"content": conteudo, "client_timestamp": client_ts, "hour_format": "24h"},
        )
    except Exception as e:
        logger.error("Erro ao falar com o backend: %s", e, exc_info=True)
        await update.effective_message.reply_text(
            "Tive um problema para falar com o servidor agora. Tenta de novo daqui a pouco? 🙏"
        )
        return

    resposta = data.get("response") or "Ok!"
    action = data.get("action") or {}

    if action.get("type") == "needs_time_clarification":
        options = action.get("options", [])
        context.chat_data["ampm_options"] = [o.get("resend", "") for o in options]
        keyboard = [
            [InlineKeyboardButton(o.get("label", f"Opção {i+1}"), callback_data=f"ampm_{i}")]
            for i, o in enumerate(options)
        ]
        await update.effective_message.reply_text(resposta, reply_markup=InlineKeyboardMarkup(keyboard))
        return

    await update.effective_message.reply_text(resposta)


async def lidar_com_mensagens_texto_geral(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await _processar_texto(update, context, update.message.text)


async def lidar_botoes(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    data = query.data or ""
    chat_id = query.message.chat_id

    # Desambiguação AM/PM: reenvia a mensagem esclarecida.
    if data.startswith("ampm_"):
        idx = int(data.split("_")[1])
        options = context.chat_data.get("ampm_options", [])
        if 0 <= idx < len(options):
            await _processar_texto(update, context, options[idx])
        return

    # Adiar (snooze): snz_<min>_<rid>_<r|o>
    if data.startswith("snz_"):
        try:
            _, minutos_str, rid, tipo = data.split("_", 3)
            minutos = int(minutos_str)
        except ValueError:
            return
        titulo = context.bot_data.get("titulos", {}).get(rid, "Lembrete")
        when = datetime.now(timezone.utc) + timedelta(minutes=minutos)

        if tipo == "r":
            # recorrente: só reenvia neste momento (não mexe na recorrência)
            context.job_queue.run_once(
                disparar_lembrete,
                when=when,
                chat_id=chat_id,
                name=f"snooze_{rid}_{when.timestamp()}",
                data={"chat_id": chat_id, "rid": rid, "titulo": titulo, "recorrente": True},
            )
        else:
            # pontual: cria um novo lembrete no backend (+min) — persiste e aparece na lista
            try:
                await _api_call(
                    chat_id,
                    "POST",
                    "/reminders",
                    json_body={"title": titulo, "scheduled_time": when.isoformat(), "recurrence": "once"},
                )
            except Exception as e:
                logger.warning("Falha ao criar lembrete adiado, usando reenvio local: %s", e)
                context.job_queue.run_once(
                    disparar_lembrete,
                    when=when,
                    chat_id=chat_id,
                    name=f"snooze_{rid}_{when.timestamp()}",
                    data={"chat_id": chat_id, "rid": rid, "titulo": titulo, "recorrente": False},
                )

        await query.edit_message_reply_markup(reply_markup=None)
        await context.bot.send_message(chat_id, f"⏰ Adiado por {minutos} minutos!")
        return


# ──────────────────────────── Disparo e polling ────────────────────────────
async def disparar_lembrete(context: ContextTypes.DEFAULT_TYPE) -> None:
    job = context.job
    d = job.data or {}
    chat_id = d.get("chat_id", job.chat_id)
    titulo = d.get("titulo", "Lembrete")
    rid = d.get("rid", "x")
    recorrente = d.get("recorrente", False)

    context.bot_data.setdefault("titulos", {})[rid] = titulo

    tipo = "r" if recorrente else "o"
    keyboard = [[
        InlineKeyboardButton("⏰ +5 min", callback_data=f"snz_5_{rid}_{tipo}"),
        InlineKeyboardButton("⏰ +10 min", callback_data=f"snz_10_{rid}_{tipo}"),
    ]]
    await context.bot.send_message(
        chat_id,
        text=f"🔔 <b>LEMBRETE</b>\n\n{titulo}",
        parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


async def poll_sync(context: ContextTypes.DEFAULT_TYPE) -> None:
    """A cada minuto: consulta /sync de cada chat e agenda os disparos iminentes."""
    sessions = _load_sessions()
    if not sessions:
        return

    now = datetime.now(timezone.utc)
    janela = now + timedelta(seconds=65)
    agendados = context.bot_data.setdefault("agendados", set())

    for chat_id_str in list(sessions.keys()):
        chat_id = int(chat_id_str)
        try:
            data = await _api_call(chat_id, "GET", "/reminders/sync")
        except Exception as e:
            logger.warning("poll_sync falhou para chat %s: %s", chat_id, e)
            continue

        for rem in (data or {}).get("reminders", []):
            if not rem.get("is_active"):
                continue
            rid = rem.get("id")
            titulo = rem.get("title", "Lembrete")
            recorrente = bool(rem.get("recurrence")) and rem.get("recurrence") != "once"
            context.bot_data.setdefault("titulos", {})[rid] = titulo

            for exec_iso in rem.get("scheduled_executions", []):
                try:
                    exec_dt = datetime.fromisoformat(exec_iso)
                    if exec_dt.tzinfo is None:
                        exec_dt = exec_dt.replace(tzinfo=timezone.utc)
                except ValueError:
                    continue

                if now < exec_dt <= janela:
                    chave = f"{rid}@{exec_iso}"
                    if chave in agendados:
                        continue
                    agendados.add(chave)
                    context.job_queue.run_once(
                        disparar_lembrete,
                        when=exec_dt,
                        chat_id=chat_id,
                        name=chave,
                        data={"chat_id": chat_id, "rid": rid, "titulo": titulo, "recorrente": recorrente},
                    )

    # limpa o set de dedup de tempos em tempo (evita crescer infinito)
    if len(agendados) > 2000:
        agendados.clear()


async def post_init(app: Application) -> None:
    app.job_queue.run_repeating(poll_sync, interval=60, first=5, name="poll_sync")
    logger.info("Bot iniciado como cliente do backend (%s).", API)


async def lidar_erros(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.error('Update "%s" causou erro "%s"', update, str(context.error), exc_info=True)


def main():
    if not TELEGRAM_TOKEN:
        raise RuntimeError("Defina TELEGRAM_TOKEN no ambiente/.env")

    application = Application.builder().token(TELEGRAM_TOKEN).post_init(post_init).build()

    application.add_handler(CommandHandler("start", comando_start))
    application.add_handler(MessageHandler(filters.VOICE, lidar_com_audio_rejeitado))
    application.add_handler(CallbackQueryHandler(lidar_botoes))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, lidar_com_mensagens_texto_geral))
    application.add_error_handler(lidar_erros)

    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
