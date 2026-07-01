"""Initial PostgreSQL schema for the Visual Search Engine backend."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False, server_default=sa.text("'user'")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("role IN ('user', 'admin')", name="ck_users_role"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_role", "users", ["role"], unique=False)

    op.create_table(
        "images",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_user_id", sa.Integer(), nullable=True),
        sa.Column("source_type", sa.String(length=20), nullable=False, server_default=sa.text("'dataset'")),
        sa.Column("storage_path", sa.String(length=512), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=True),
        sa.Column("mime_type", sa.String(length=100), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("checksum", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("source_type IN ('dataset', 'upload')", name="ck_images_source_type"),
        sa.CheckConstraint("status IN ('pending', 'indexed', 'failed')", name="ck_images_status"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], name="fk_images_owner_user_id", ondelete="SET NULL"),
    )
    op.create_index("ix_images_owner_user_id", "images", ["owner_user_id"], unique=False)
    op.create_index("ix_images_status", "images", ["status"], unique=False)
    op.create_index("ix_images_created_at", "images", ["created_at"], unique=False)
    op.create_index("ix_images_checksum", "images", ["checksum"], unique=False)

    op.create_table(
        "image_embeddings",
        sa.Column("image_id", sa.Integer(), primary_key=True),
        sa.Column("qdrant_point_id", sa.String(length=255), nullable=False),
        sa.Column("collection_name", sa.String(length=255), nullable=False),
        sa.Column("model_name", sa.String(length=255), nullable=False),
        sa.Column("embedding_dim", sa.Integer(), nullable=False),
        sa.Column("vector_status", sa.String(length=20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("vector_status IN ('pending', 'synced', 'failed')", name="ck_image_embeddings_vector_status"),
        sa.ForeignKeyConstraint(["image_id"], ["images.id"], name="fk_image_embeddings_image_id", ondelete="CASCADE"),
        sa.UniqueConstraint("qdrant_point_id", name="uq_image_embeddings_qdrant_point_id"),
    )
    op.create_index("ix_image_embeddings_vector_status", "image_embeddings", ["vector_status"], unique=False)
    op.create_index("ix_image_embeddings_collection_name", "image_embeddings", ["collection_name"], unique=False)

    op.create_table(
        "ocr_texts",
        sa.Column("image_id", sa.Integer(), primary_key=True),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column("language", sa.String(length=20), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("tsv", postgresql.TSVECTOR(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["image_id"], ["images.id"], name="fk_ocr_texts_image_id", ondelete="CASCADE"),
    )
    op.create_index("ix_ocr_texts_image_id", "ocr_texts", ["image_id"], unique=False)
    op.create_index("ix_ocr_texts_language", "ocr_texts", ["language"], unique=False)
    op.create_index("ix_ocr_texts_tsv", "ocr_texts", ["tsv"], unique=False, postgresql_using="gin")

    op.create_table(
        "indexing_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("batch_id", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default=sa.text("'queued'")),
        sa.Column("total_images", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("processed_images", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("failed_images", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("status IN ('queued', 'running', 'completed', 'failed')", name="ck_indexing_batches_status"),
        sa.UniqueConstraint("batch_id", name="uq_indexing_batches_batch_id"),
    )
    op.create_index("ix_indexing_batches_status", "indexing_batches", ["status"], unique=False)
    op.create_index("ix_indexing_batches_created_at", "indexing_batches", ["created_at"], unique=False)

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_refresh_tokens_user_id", ondelete="CASCADE"),
        sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"], unique=False)

    op.create_table(
        "search_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("query_type", sa.String(length=20), nullable=False),
        sa.Column("query_value", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("query_type IN ('image', 'semantic', 'ocr')", name="ck_search_history_query_type"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_search_history_user_id", ondelete="CASCADE"),
    )
    op.create_index("ix_search_history_user_id", "search_history", ["user_id"], unique=False)
    op.create_index("ix_search_history_query_type", "search_history", ["query_type"], unique=False)
    op.create_index("ix_search_history_created_at", "search_history", ["created_at"], unique=False)

    op.create_table(
        "bookmarks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("image_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_bookmarks_user_id", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["image_id"], ["images.id"], name="fk_bookmarks_image_id", ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "image_id", name="uq_bookmarks_user_image"),
    )
    op.create_index("ix_bookmarks_user_id", "bookmarks", ["user_id"], unique=False)
    op.create_index("ix_bookmarks_image_id", "bookmarks", ["image_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_bookmarks_image_id", table_name="bookmarks")
    op.drop_index("ix_bookmarks_user_id", table_name="bookmarks")
    op.drop_table("bookmarks")

    op.drop_index("ix_search_history_created_at", table_name="search_history")
    op.drop_index("ix_search_history_query_type", table_name="search_history")
    op.drop_index("ix_search_history_user_id", table_name="search_history")
    op.drop_table("search_history")

    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")

    op.drop_index("ix_indexing_batches_created_at", table_name="indexing_batches")
    op.drop_index("ix_indexing_batches_status", table_name="indexing_batches")
    op.drop_table("indexing_batches")

    op.drop_index("ix_ocr_texts_tsv", table_name="ocr_texts")
    op.drop_index("ix_ocr_texts_language", table_name="ocr_texts")
    op.drop_index("ix_ocr_texts_image_id", table_name="ocr_texts")
    op.drop_table("ocr_texts")

    op.drop_index("ix_image_embeddings_collection_name", table_name="image_embeddings")
    op.drop_index("ix_image_embeddings_vector_status", table_name="image_embeddings")
    op.drop_table("image_embeddings")

    op.drop_index("ix_images_created_at", table_name="images")
    op.drop_index("ix_images_checksum", table_name="images")
    op.drop_index("ix_images_status", table_name="images")
    op.drop_index("ix_images_owner_user_id", table_name="images")
    op.drop_table("images")

    op.drop_index("ix_users_role", table_name="users")
    op.drop_table("users")
