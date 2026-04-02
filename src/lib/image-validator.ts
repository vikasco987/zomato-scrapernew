import sharp from "sharp";
import axios from "axios";

export interface ValidationResult {
    status: 'PASSED' | 'REJECTED';
    score: number;
    checks: {
        size: boolean;
        resolution: boolean;
        blur: boolean;
    };
}

export async function validateImageBuffer(buffer: Buffer): Promise<ValidationResult> {
    try {
        const metadata = await sharp(buffer).metadata();
        const stats = await sharp(buffer).stats();

        const checks = {
            size: buffer.length < 5 * 1024 * 1024, // < 5MB
            resolution: (metadata.width || 0) >= 500 && (metadata.height || 0) >= 200,
            blur: (Array.isArray(stats.entropy) ? stats.entropy[0] : (stats.entropy as any)) < 3, 
        };

        const score = Math.round(Math.random() * 20 + 75); // Mock score for now based on checks

        if (!checks.size || !checks.resolution || checks.blur) {
            return { status: 'REJECTED', score: 40, checks };
        }

        return { status: 'PASSED', score, checks };
    } catch (e) {
        return { status: 'REJECTED', score: 0, checks: { size: false, resolution: false, blur: false } };
    }
}

export async function isUrlAlive(url: string): Promise<boolean> {
    try {
        const res = await axios.head(url, { timeout: 5000 });
        return res.status === 200;
    } catch (e) {
        return false;
    }
}
