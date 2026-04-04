import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

interface CdnProps {
  bucket: s3.Bucket;
  publicKeyPem: string;
  privateKeySecretArn: string;
  priceClass?: cloudfront.PriceClass;
}

export class CdnConstruct extends Construct {
  readonly distribution: cloudfront.Distribution;
  readonly keyGroup: cloudfront.KeyGroup;
  readonly privateKeySecretArn: string;
  private readonly cfPublicKey: cloudfront.PublicKey;

  get cloudfrontDomain(): string {
    return this.distribution.distributionDomainName;
  }
  get keyPairId(): string {
    return this.cfPublicKey.publicKeyId;
  }

  constructor(scope: Construct, id: string, props: CdnProps) {
    super(scope, id);

    this.privateKeySecretArn = props.privateKeySecretArn;

    this.cfPublicKey = new cloudfront.PublicKey(this, "CfPublicKey", {
      encodedKey: props.publicKeyPem,
    });

    this.keyGroup = new cloudfront.KeyGroup(this, "CfKeyGroup", {
      items: [this.cfPublicKey],
    });

    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(
      props.bucket,
      {
        originAccessLevels: [cloudfront.AccessLevel.READ],
      },
    );

    const thumbnailCachePolicy = new cloudfront.CachePolicy(
      this,
      "ThumbnailPolicy",
      {
        defaultTtl: cdk.Duration.hours(24),
        minTtl: cdk.Duration.seconds(0),
        maxTtl: cdk.Duration.days(7),
        queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
        headerBehavior: cloudfront.CacheHeaderBehavior.none(),
        cookieBehavior: cloudfront.CacheCookieBehavior.none(),
        enableAcceptEncodingGzip: true,
        enableAcceptEncodingBrotli: true,
      },
    );

    const defaultCachePolicy = new cloudfront.CachePolicy(
      this,
      "DefaultPolicy",
      {
        defaultTtl: cdk.Duration.hours(1),
        minTtl: cdk.Duration.seconds(0),
        maxTtl: cdk.Duration.hours(24),
        queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
        headerBehavior: cloudfront.CacheHeaderBehavior.none(),
        cookieBehavior: cloudfront.CacheCookieBehavior.none(),
        enableAcceptEncodingGzip: true,
        enableAcceptEncodingBrotli: true,
      },
    );

    const trustedKeyGroups = [this.keyGroup];

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      priceClass: props.priceClass ?? cloudfront.PriceClass.PRICE_CLASS_200,
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        cachePolicy: defaultCachePolicy,
        trustedKeyGroups,
      },
      additionalBehaviors: {
        "users/*/thumbnails/*": {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: thumbnailCachePolicy,
          trustedKeyGroups,
        },
        "users/*/previews/*": {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: thumbnailCachePolicy,
          trustedKeyGroups,
        },
        "users/*/videos/*": {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: defaultCachePolicy,
          trustedKeyGroups,
        },
      },
    });
  }
}
