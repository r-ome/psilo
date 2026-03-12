import * as cdk from "aws-cdk-lib";
import * as batch from "aws-cdk-lib/aws-batch";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { DatabaseConstruct } from "./database";

interface VideoPipelineProps {
  bucket: s3.Bucket;
  database: DatabaseConstruct;
}

export class VideoPipelineConstruct extends Construct {
  readonly jobQueueArn: string;
  readonly jobDefinitionArn: string;
  readonly ecrRepo: ecr.Repository;

  constructor(scope: Construct, id: string, props: VideoPipelineProps) {
    super(scope, id);

    const { bucket, database } = props;

    // ECR repository for the batch job image
    this.ecrRepo = new ecr.Repository(this, "EcrRepo", {
      repositoryName: "video-thumbnail-processor",
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // VPC for Batch Fargate tasks (public subnets + assign public IP for AWS API access)
    const vpc = new ec2.Vpc(this, "BatchVpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC },
      ],
    });

    const securityGroup = new ec2.SecurityGroup(this, "BatchSg", {
      vpc,
      description: "Security group for video batch jobs",
      allowAllOutbound: true,
    });

    // Job role: permissions to access S3 and DB
    const jobRole = new iam.Role(this, "BatchJobRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    bucket.grantRead(jobRole, "users/*/videos/*");
    bucket.grantPut(jobRole, "users/*/thumbnails/*");
    bucket.grantPut(jobRole, "users/*/previews/*");
    database.grantAccess(jobRole);

    // Execution role: for ECS to pull image and write logs
    const executionRole = new iam.Role(this, "BatchExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy"
        ),
      ],
    });
    this.ecrRepo.grantPull(executionRole);

    // Compute environment: Fargate Spot
    const computeEnv = new batch.CfnComputeEnvironment(this, "ComputeEnv", {
      type: "MANAGED",
      computeResources: {
        type: "FARGATE_SPOT",
        maxvCpus: 256,
        subnets: vpc.publicSubnets.map((s) => s.subnetId),
        securityGroupIds: [securityGroup.securityGroupId],
      },
    });

    // Job queue
    const jobQueue = new batch.CfnJobQueue(this, "JobQueue", {
      priority: 1,
      computeEnvironmentOrder: [
        { order: 1, computeEnvironment: computeEnv.ref },
      ],
    });

    // Job definition
    const jobDefinition = new batch.CfnJobDefinition(this, "JobDefinition", {
      type: "container",
      platformCapabilities: ["FARGATE"],
      containerProperties: {
        image: `${this.ecrRepo.repositoryUri}:latest`,
        resourceRequirements: [
          { type: "VCPU", value: "2" },
          { type: "MEMORY", value: "4096" },
        ],
        executionRoleArn: executionRole.roleArn,
        jobRoleArn: jobRole.roleArn,
        networkConfiguration: {
          assignPublicIp: "ENABLED",
        },
        fargatePlatformConfiguration: {
          platformVersion: "LATEST",
        },
        environment: [
          { name: "BUCKET_NAME", value: bucket.bucketName },
          { name: "DB_CLUSTER_ARN", value: database.cluster.clusterArn },
          { name: "DB_SECRET_ARN", value: database.secret.secretArn },
          { name: "DB_NAME", value: "psilo" },
          { name: "AWS_REGION", value: cdk.Stack.of(this).region },
        ],
      },
    });

    this.jobQueueArn = jobQueue.ref;
    this.jobDefinitionArn = jobDefinition.ref;
  }
}
