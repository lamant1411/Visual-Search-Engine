"""Merge the legacy admin indexing and item-level indexing histories."""


revision = "0007_merge_indexing_histories"
down_revision = (
    "0006_add_cancelled_batch_status",
    "0005_add_indexing_items",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
