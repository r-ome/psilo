import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { IGrantable } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

interface DatabaseProps {
  isProd: boolean;
}

export class DatabaseConstruct extends Construct {
  readonly cluster: rds.DatabaseCluster;
  readonly secret: secretsmanager.Secret;
  readonly env: { DB_CLUSTER_ARN: string; DB_SECRET_ARN: string; DB_NAME: string };

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "isolated", subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });

    this.secret = new secretsmanager.Secret(this, "DbSecret", {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "postgres" }),
        generateStringKey: "password",
        excludeCharacters: '/@"',
      },
    });

    this.cluster = new rds.DatabaseCluster(this, "Cluster", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_6,
      }),
      writer: rds.ClusterInstance.serverlessV2("writer", { scaleWithWriter: true }),
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 2,
      enableDataApi: true,
      credentials: rds.Credentials.fromSecret(this.secret),
      defaultDatabaseName: "psilo",
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      removalPolicy: props.isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.env = {
      DB_CLUSTER_ARN: this.cluster.clusterArn,
      DB_SECRET_ARN: this.secret.secretArn,
      DB_NAME: "psilo",
    };
  }

  grantAccess(grantable: IGrantable): void {
    this.cluster.grantDataApiAccess(grantable);
    this.secret.grantRead(grantable);
  }
}
