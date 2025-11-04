// Type definitions for encryption utilities
type EncryptionAlgorithm = 'AES-GCM';
const STORAGE_KEY: string = 'enc_key';
const ALGORITHM: EncryptionAlgorithm = 'AES-GCM';
const KEY_LENGTH: number = 256;

/**
 * 生成加密密钥
 */
const generateKey = async (): Promise<CryptoKey> => {
    const key = await window.crypto.subtle.generateKey(
        {
            name: ALGORITHM,
            length: KEY_LENGTH,
        },
        true, // 可导出
        ['encrypt', 'decrypt']
    );

    // 导出密钥并存储
    const exportedKey = await window.crypto.subtle.exportKey('raw', key);
    const keyBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedKey)));
    localStorage.setItem(STORAGE_KEY, keyBase64);

    return key;
};

/**
 * 获取或生成加密密钥
 */
const getKey = async (): Promise<CryptoKey> => {
    const storedKey: string | null = localStorage.getItem(STORAGE_KEY);
    if (storedKey) {
        const keyBuffer: Uint8Array = Uint8Array.from(atob(storedKey), (c: string) => c.charCodeAt(0));
        return await window.crypto.subtle.importKey(
            'raw',
            keyBuffer,
            ALGORITHM,
            true,
            ['encrypt', 'decrypt']
        );
    }
    return await generateKey();
};

/**
 * 加密文本
 * @param {string} text - 要加密的文本
 * @returns {Promise<string>} - 加密后的 Base64 字符串
 */
export const encrypt = async (text: string): Promise<string> => {
    try {
        if (!text) return '';

        const key: CryptoKey = await getKey();
        const iv: Uint8Array = window.crypto.getRandomValues(new Uint8Array(12));
        const encoder: TextEncoder = new TextEncoder();

        const encryptedData: ArrayBuffer = await window.crypto.subtle.encrypt(
            {
                name: ALGORITHM,
                iv,
            },
            key,
            encoder.encode(text)
        );

        // 将 IV 和加密数据合并并转换为 Base64
        const encryptedArray: Uint8Array = new Uint8Array(iv.length + encryptedData.byteLength);
        encryptedArray.set(iv);
        encryptedArray.set(new Uint8Array(encryptedData), iv.length);

        return btoa(String.fromCharCode(...encryptedArray));
    } catch (error: unknown) {
        console.error('Encryption failed:', error);
        throw new Error('Failed to encrypt data');
    }
};

/**
 * 解密文本
 * @param {string} encryptedText - Base64 格式的加密文本
 * @returns {Promise<string>} - 解密后的文本
 */
export const decrypt = async (encryptedText: string): Promise<string> => {
    try {
        if (!encryptedText) return '';

        const key: CryptoKey = await getKey();
        const decoder: TextDecoder = new TextDecoder();

        // 解析 Base64 并分离 IV 和加密数据
        const encryptedArray: Uint8Array = Uint8Array.from(atob(encryptedText), (c: string) => c.charCodeAt(0));
        const iv: Uint8Array = encryptedArray.slice(0, 12);
        const data: Uint8Array = encryptedArray.slice(12);

        const decryptedData: ArrayBuffer = await window.crypto.subtle.decrypt(
            {
                name: ALGORITHM,
                iv,
            },
            key,
            data
        );

        return decoder.decode(decryptedData);
    } catch (error: unknown) {
        console.error('Decryption failed:', error);
        throw new Error('Failed to decrypt data');
    }
};

// 用于测试加密和解密功能的辅助函数
export const testEncryption = async (): Promise<boolean> => {
    try {
        const testText: string = 'Hello, World!';
        
        const encrypted: string = await encrypt(testText);

        const decrypted: string = await decrypt(encrypted);

        if (testText === decrypted) {
            return true;
        } else {
            console.error('Encryption test failed: decrypted text does not match original');
            return false;
        }
    } catch (error: unknown) {
        console.error('Encryption test failed:', error);
        return false;
    }
};