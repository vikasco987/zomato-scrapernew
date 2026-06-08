import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config({ path: '/Users/vikas/.gemini/antigravity-ide/scratch/kravy-pos-website/.env' });

async function downloadLatestBackup() {
    const s3Client = new S3Client({
        region: process.env.AWS_REGION || "eu-north-1",
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        }
    });

    const bucket = process.env.AWS_S3_BACKUP_BUCKET;

    try {
        const command = new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: "backups/",
        });

        const response = await s3Client.send(command);
        if (!response.Contents) {
            console.log("❌ No backups found.");
            return;
        }

        const backups = response.Contents
            .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0));

        if (backups.length === 0) {
            console.log("❌ No backups found.");
            return;
        }
        
        const latestBackup = backups[0];
        console.log(`Downloading latest backup: ${latestBackup.Key}`);
        
        const getCommand = new GetObjectCommand({
            Bucket: bucket,
            Key: latestBackup.Key,
        });
        
        const { Body } = await s3Client.send(getCommand);
        
        const writeStream = fs.createWriteStream("latest_backup.json");
        const stream = Body as NodeJS.ReadableStream;
        stream.pipe(writeStream);
        
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });
        
        console.log("✅ Backup downloaded successfully to latest_backup.json");

    } catch (err) {
        console.error("❌ Error listing backups:", err);
    }
}

downloadLatestBackup();
