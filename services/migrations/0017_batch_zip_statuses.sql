ALTER TABLE retrieval_batches
  ADD CONSTRAINT retrieval_batches_status_check
  CHECK (status IN ('PENDING','IN_PROGRESS','ZIPPING','COMPLETED','FAILED','PARTIAL_FAILURE','AVAILABLE','PARTIAL','EXPIRED'));
--> statement-breakpoint
ALTER TABLE retrieval_requests
  ADD CONSTRAINT retrieval_requests_status_check
  CHECK (status IN ('PENDING','IN_PROGRESS','READY','FAILED','AVAILABLE','EXPIRED'));
