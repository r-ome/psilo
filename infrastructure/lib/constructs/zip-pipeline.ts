import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { DatabaseConstruct } from "./database";

interface ZipPipelineProps {
  bucket: s3.Bucket;
  database: DatabaseConstruct;
}

export class ZipPipelineConstruct extends Construct {
  readonly zipBucket: s3.Bucket;
  readonly cluster: ecs.Cluster;
  readonly taskDefinition: ecs.FargateTaskDefinition;
  readonly containerName: string;
  readonly vpc: ec2.Vpc;
  readonly securityGroup: ec2.SecurityGroup;
  readonly ecrRepo: ecr.Repository;

  constructor(scope: Construct, id: string, props: ZipPipelineProps) {
    super(scope, id);

    const { bucket, database } = props;

    // S3 bucket for zip files — objects expire after 24h
    this.zipBucket = new s3.Bucket(this, "ZipBucket", {
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(1),
          enabled: true,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ECR repository for zip processor image (imported — repo created manually before first deploy)
    this.ecrRepo = ecr.Repository.fromRepositoryName(this, "EcrRepo", "zip-processor") as ecr.Repository;

    // VPC: 2 AZs, public subnets only, no NAT (same pattern as video pipeline)
    this.vpc = new ec2.Vpc(this, "ZipVpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC },
      ],
    });

    this.securityGroup = new ec2.SecurityGroup(this, "ZipSg", {
      vpc: this.vpc,
      description: "Security group for zip processor Fargate tasks",
      allowAllOutbound: true,
    });

    // ECS cluster
    this.cluster = new ecs.Cluster(this, "ZipCluster", { vpc: this.vpc });

    // Task role: read source bucket + read/write zip bucket + DB access
    const taskRole = new iam.Role(this, "ZipTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    bucket.grantRead(taskRole);
    this.zipBucket.grantReadWrite(taskRole);
    database.grantAccess(taskRole);

    // Execution role: ECR pull + CloudWatch logs
    const executionRole = new iam.Role(this, "ZipExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy",
        ),
      ],
    });
    this.ecrRepo.grantPull(executionRole);

    // Fargate task definition: 2 vCPU, 4 GB RAM
    this.taskDefinition = new ecs.FargateTaskDefinition(this, "ZipTaskDef", {
      cpu: 2048,
      memoryLimitMiB: 4096,
      taskRole,
      executionRole,
    });

    this.containerName = "zip-processor";
    this.taskDefinition.addContainer(this.containerName, {
      image: ecs.ContainerImage.fromEcrRepository(
        this.ecrRepo,
        this.node.tryGetContext("imageTag") ?? "latest",
      ),
      environment: {
        BUCKET_NAME: bucket.bucketName,
        ZIP_BUCKET_NAME: this.zipBucket.bucketName,
        DB_CLUSTER_ARN: database.cluster.clusterArn,
        DB_SECRET_ARN: database.secret.secretArn,
        DB_NAME: "psilo",
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "zip-processor" }),
    });
    // BATCH_ID is injected at runtime via RunTaskCommand containerOverrides
  }
}
