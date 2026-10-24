"""Sanitize the complete rendered Python log, including traceback and extras."""
import copy
import logging

from . import pii


class RedactingFormatter(logging.Formatter):
    def __init__(self, wrapped=None):
        super().__init__()
        self.wrapped = wrapped or logging.Formatter()

    def format(self, record):
        try:
            # A formatter caches exc_text on the record: do not pass that cache
            # (or a mutation of the message) to another handler.
            rendered = self.wrapped.format(copy.copy(record))
            return pii.redact_always(rendered)
        except Exception:
            return pii.REDACTION_ERROR


def install_log_redaction():
    """Wrap configured handlers; safe to repeat after uvicorn configures logs."""
    root = logging.getLogger()
    if not root.handlers:
        root.addHandler(logging.StreamHandler())
    loggers = [root] + [logger for logger in logging.root.manager.loggerDict.values()
                        if isinstance(logger, logging.Logger)]
    for logger in loggers:
        for handler in logger.handlers:
            if not isinstance(handler.formatter, RedactingFormatter):
                handler.setFormatter(RedactingFormatter(handler.formatter))
