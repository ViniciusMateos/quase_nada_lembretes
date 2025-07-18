import os
from dotenv import load_dotenv
import logging
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters

# Carrega as variáveis de ambiente do arquivo .env
load_dotenv()

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# Configura o log para ver o que está acontecendo
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# --- Funções do Bot ---

# Função que responde ao comando /start
async def start(update: Update, context):
    """Envia uma mensagem quando o comando /start é emitido."""
    user = update.effective_user
    await update.message.reply_html(
        f"Olá, {user.mention_html()}! Eu sou seu bot de lembretes. Como posso ajudar?",
    )

# Função que ecoa qualquer mensagem de texto que o usuário enviar
async def echo(update: Update, context):
    """Ecoa a mensagem do usuário."""
    await update.message.reply_text(f"Você disse: {update.message.text}")

# Função para lidar com erros
async def error(update: Update, context):
    """Registra Erros causados por Updates."""
    logger.warning(f'Update "{update}" causou erro "{context.error}"')
    if update.effective_message:
        await update.effective_message.reply_text("Ops! Algo deu errado. Por favor, tente novamente mais tarde.")

# --- Função Principal para Iniciar o Bot ---

def main():
    """Inicia o bot."""
    
    # Cria a Aplicação e passa o token do seu bot
    application = Application.builder().token(TELEGRAM_TOKEN).build()

    # Adiciona os Handlers para os comandos e mensagens
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))

    # Adiciona o Handler para erros
    application.add_error_handler(error)

    # Inicia o bot (polling)
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()