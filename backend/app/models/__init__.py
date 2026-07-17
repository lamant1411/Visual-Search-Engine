"""Import các ORM model ở đây để Alembic nhận diện toàn bộ bảng."""

from app.models.bookmark import Bookmark
from app.models.image import Image
from app.models.image_embedding import ImageEmbedding
from app.models.indexing_batch import IndexingBatch
from app.models.indexing_item import IndexingItem
from app.models.ocr_text import OCRText
from app.models.refresh_token import RefreshToken
from app.models.search_history import SearchHistory
from app.models.user import User
