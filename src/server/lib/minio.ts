import { Client, type BucketItemWithMetadata } from "minio";

export const createMinio = () => {
  const minio = new Client({
    endPoint: process.env.S3_URL!,
    port: parseInt(process.env.S3_PORT!),
    useSSL: true,
    accessKey: process.env.S3_KEY_ID!,
    secretKey: process.env.S3_PASSWORD!,
  });

  const subBuckets = {
    images: "images",
    videos: "videos",
    text: "text",
  } as const;

  // Helper to construct full path with main bucket and subfolder
  const getFullPath = (
    subBucket: keyof typeof subBuckets,
    objectPath: string,
  ) => {
    return `${subBuckets[subBucket]}/${objectPath}`;
  };

  const getObjects = async (subBucket: keyof typeof subBuckets) => {
    const objectsList = await new Promise<BucketItemWithMetadata[]>(
      (resolve, reject) => {
        const objectsListTemp = [] as BucketItemWithMetadata[];
        const stream = minio.extensions.listObjectsV2WithMetadata(
          process.env.S3_BUCKET_NAME!,
          `${subBuckets[subBucket]}/`, // Add trailing slash to list contents of subfolder
          true,
          "",
        );

        stream.on("data", (obj) => objectsListTemp.push(obj));
        stream.on("error", reject);
        stream.on("end", () => {
          resolve(objectsListTemp);
        });
      },
    );

    return objectsList;
  };

  const getObject = async (
    subBucket: keyof typeof subBuckets,
    objectPath: string,
  ) => {
    return minio.getObject(
      process.env.S3_BUCKET_NAME!,
      getFullPath(subBucket, objectPath),
    );
  };

  const putObject = async (
    subBucket: keyof typeof subBuckets,
    objectPath: string,
    data: Buffer | string,
    metaData?: Record<string, string>,
  ) => {
    return minio.putObject(
      process.env.S3_BUCKET_NAME!,
      getFullPath(subBucket, objectPath),
      data,
      metaData as any,
    );
  };

  const deleteObject = async (
    subBucket: keyof typeof subBuckets,
    objectPath: string,
  ) => {
    return minio.removeObject(
      process.env.S3_BUCKET_NAME!,
      getFullPath(subBucket, objectPath),
    );
  };

  const deleteObjects = async (
    subBucket: keyof typeof subBuckets,
    objectPaths: string[],
  ) => {
    return minio.removeObjects(
      process.env.S3_BUCKET_NAME!,
      objectPaths.map((path) => getFullPath(subBucket, path)),
    );
  };

  const listObjects = async (
    subBucket: keyof typeof subBuckets,
    prefix: string,
  ) => {
    const objectsList = await new Promise<BucketItemWithMetadata[]>(
      (resolve, reject) => {
        const objectsListTemp = [] as BucketItemWithMetadata[];
        const stream = minio.extensions.listObjectsV2WithMetadata(
          process.env.S3_BUCKET_NAME!,
          `${subBuckets[subBucket]}/${prefix}`,
          true,
          "",
        );

        stream.on("data", (obj) => {
          const cleanedObj = {
            ...obj,
            name: obj.name?.replace(`${subBuckets[subBucket]}/`, ""),
          };
          objectsListTemp.push(cleanedObj as BucketItemWithMetadata);
        });
        stream.on("error", reject);
        stream.on("end", () => {
          resolve(objectsListTemp);
        });
      },
    );

    return objectsList;
  };

  return {
    client: minio,
    functions: {
      getObjects,
      getObject,
      putObject,
      deleteObject,
      deleteObjects,
      listObjects,
    },
    subBuckets,
    constants: {
      baseUrl: `https://${process.env.S3_URL!}/${process.env.S3_BUCKET_NAME!}`,
      bucket: process.env.S3_BUCKET_NAME!,
      url: process.env.S3_URL!,
    },
  };
};
