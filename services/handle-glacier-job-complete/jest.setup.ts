process.env.ECS_CLUSTER_ARN = process.env.ECS_CLUSTER_ARN ?? "cluster";
process.env.ECS_TASK_DEFINITION_ARN = process.env.ECS_TASK_DEFINITION_ARN ?? "task";
process.env.ECS_SUBNET_IDS = process.env.ECS_SUBNET_IDS ?? "subnet-a,subnet-b";
process.env.ECS_SECURITY_GROUP_IDS = process.env.ECS_SECURITY_GROUP_IDS ?? "sg-a";
process.env.ECS_CONTAINER_NAME = process.env.ECS_CONTAINER_NAME ?? "zipper";
