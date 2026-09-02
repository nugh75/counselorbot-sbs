"""Client minimale per la Telegram Bot API (httpx, nessuna libreria esterna).

Solo le chiamate usate dal bot CounselorBot: sendMessage (con inline keyboard
opzionale), sendPhoto per i diagrammi, getFile per i PDF di pQBL e
answerCallbackQuery. I messaggi lunghi vengono spezzati sotto il
limite Telegram di 4096 caratteri.
"""
import logging
import os

import httpx

logger = logging.getLogger(__name__)

TELEGRAM_MESSAGE_MAX = 4096


def bot_enabled() -> bool:
    return os.environ.get("TELEGRAM_BOT_ENABLED", "").strip().lower() == "true"


def webhook_secret() -> str:
    return os.environ.get("TELEGRAM_WEBHOOK_SECRET", "").strip()


def _api_url(method: str) -> str:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    return f"https://api.telegram.org/bot{token}/{method}"


def split_message(text: str, max_len: int = TELEGRAM_MESSAGE_MAX) -> list[str]:
    """Spezza il testo sotto il limite Telegram, preferendo i confini di paragrafo."""
    text = (text or "").strip()
    if not text:
        return []
    chunks: list[str] = []
    while len(text) > max_len:
        cut = text.rfind("\n\n", 0, max_len)
        if cut < max_len // 2:
            cut = text.rfind("\n", 0, max_len)
        if cut < max_len // 2:
            cut = text.rfind(" ", 0, max_len)
        if cut <= 0:
            cut = max_len
        chunks.append(text[:cut].strip())
        text = text[cut:].strip()
    if text:
        chunks.append(text)
    return chunks


async def send_message(chat_id: int, text: str, keyboard: list[list[dict]] | None = None) -> None:
    """Invia `text` (plain text) a `chat_id`; la keyboard inline va sull'ultimo chunk."""
    chunks = split_message(text)
    if not chunks:
        return
    async with httpx.AsyncClient(timeout=15.0) as client:
        for i, chunk in enumerate(chunks):
            payload: dict = {"chat_id": chat_id, "text": chunk}
            if keyboard and i == len(chunks) - 1:
                payload["reply_markup"] = {"inline_keyboard": keyboard}
            try:
                response = await client.post(_api_url("sendMessage"), json=payload)
                if response.status_code != 200:
                    # Non loggare il body: puo' contenere testo studente.
                    logger.error("Telegram sendMessage fallita: HTTP %s", response.status_code)
            except httpx.HTTPError as e:
                logger.error("Telegram sendMessage errore rete: %s", type(e).__name__)


async def send_photo(chat_id: int, image: bytes, caption: str = "") -> None:
    """Invia un'immagine (i diagrammi della chat arrivano qui come PNG)."""
    if not image:
        return
    data: dict = {"chat_id": str(chat_id)}
    if caption:
        data["caption"] = caption[:1024]
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                _api_url("sendPhoto"),
                data=data,
                files={"photo": ("diagram.png", image, "image/png")},
            )
            if response.status_code != 200:
                logger.error("Telegram sendPhoto fallita: HTTP %s", response.status_code)
    except httpx.HTTPError as e:
        logger.error("Telegram sendPhoto errore rete: %s", type(e).__name__)


_bot_username_cache: str | None = None


async def get_bot_username() -> str:
    """Username del bot (per i deep link t.me), da getMe, cachato per processo."""
    global _bot_username_cache
    if _bot_username_cache:
        return _bot_username_cache
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(_api_url("getMe"))
            if response.status_code == 200:
                _bot_username_cache = (response.json().get("result") or {}).get("username") or ""
    except httpx.HTTPError as e:
        logger.error("Telegram getMe errore rete: %s", type(e).__name__)
    return _bot_username_cache or ""


# Limite di Telegram per i file che un bot puo' scaricare (20 MB): oltre questa
# soglia getFile risponde "file is too big" e l'unica strada resta il web.
MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024


async def download_file(file_id: str) -> bytes | None:
    """Scarica un file inviato in chat: getFile per il path, poi il contenuto."""
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            info = await client.get(_api_url("getFile"), params={"file_id": file_id})
            if info.status_code != 200:
                logger.error("Telegram getFile fallita: %s", info.status_code)
                return None
            file_path = ((info.json().get("result") or {}).get("file_path") or "").strip()
            if not file_path:
                return None
            content = await client.get(f"https://api.telegram.org/file/bot{token}/{file_path}")
            if content.status_code != 200:
                logger.error("Telegram download fallito: %s", content.status_code)
                return None
            return content.content
    except httpx.HTTPError as e:
        logger.error("Telegram download errore rete: %s", type(e).__name__)
        return None


async def answer_callback_query(callback_query_id: str) -> None:
    """Chiude lo spinner del bottone inline (nessun testo)."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(_api_url("answerCallbackQuery"), json={"callback_query_id": callback_query_id})
    except httpx.HTTPError as e:
        logger.error("Telegram answerCallbackQuery errore rete: %s", type(e).__name__)
