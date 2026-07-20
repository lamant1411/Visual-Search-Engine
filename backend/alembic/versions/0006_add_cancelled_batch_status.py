"""Allow indexing batches to be cancelled."""

from alembic import op


revision = "0006_add_cancelled_batch_status"
down_revision = "0005_expand_indexing_batches"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_indexing_batches_status", "indexing_batches", type_="check")
    op.create_check_constraint(
        "ck_indexing_batches_status",
        "indexing_batches",
        "status IN ('queued', 'running', 'completed', 'failed', 'cancelled')",
    )


def downgrade() -> None:
    op.execute(
        "UPDATE indexing_batches SET status = 'failed', "
        "error_message = COALESCE(error_message, 'Batch was cancelled.') "
        "WHERE status = 'cancelled'"
    )
    op.drop_constraint("ck_indexing_batches_status", "indexing_batches", type_="check")
    op.create_check_constraint(
        "ck_indexing_batches_status",
        "indexing_batches",
        "status IN ('queued', 'running', 'completed', 'failed')",
    )
