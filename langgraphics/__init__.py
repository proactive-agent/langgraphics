import logging

from .watch import watch

# ignore the expected noise of the websocket handshake failures
logging.getLogger("websockets.server").addFilter(lambda _: False)

__all__ = ["watch"]
