"""add bounded edit-distance helper for short OCR queries

Revision ID: 0018_short_ocr_edit
Revises: 0017_fuzzy_ocr_search
Create Date: 2026-08-01
"""

from alembic import op


revision = "0018_short_ocr_edit"
down_revision = "0017_fuzzy_ocr_search"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;")
    op.execute(
        """
        CREATE FUNCTION ocr_min_token_edit_distance(
            query_text text,
            document_text text,
            max_distance integer
        )
        RETURNS integer
        LANGUAGE sql
        IMMUTABLE
        PARALLEL SAFE
        RETURNS NULL ON NULL INPUT
        AS $$
            SELECT COALESCE(
                min(
                    public.levenshtein_less_equal(
                        left(token, 255),
                        left(query_text, 255),
                        max_distance
                    )
                ),
                max_distance + 1
            )
            FROM regexp_split_to_table(document_text, '\\s+') AS token
            WHERE abs(length(token) - length(query_text)) <= max_distance
        $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP FUNCTION IF EXISTS ocr_min_token_edit_distance(text, text, integer);
        """
    )
    # fuzzystrmatch is intentionally retained because another feature may use it.
