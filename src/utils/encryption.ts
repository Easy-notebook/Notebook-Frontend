// Type definitions for encryption utilities
type EncryptionAlgorithm = 'AES-GCM';
const STORAGE_KEY = 'enc_key';
const ALGORITHM: EncryptionAlgorithm = 'AES-GCM';
const KEY_LENGTH = 256;

/** One in-flight key load per application instance; settled loads release ownership. */
class EncryptionKeyProvider {
  private inFlight: Promise<CryptoKey> | undefined;

  get(): Promise<CryptoKey> {
    if (this.inFlight) return this.inFlight;
    const request = this.load();
    this.inFlight = request;
    const release = () => {
      if (this.inFlight === request) this.inFlight = undefined;
    };
    void request.then(release, release);
    return request;
  }

  private importStored(storedKey: string): Promise<CryptoKey> {
    const keyBuffer = Uint8Array.from(atob(storedKey), (character) => character.charCodeAt(0));
    return window.crypto.subtle.importKey('raw', keyBuffer, ALGORITHM, true, [
      'encrypt',
      'decrypt',
    ]);
  }

  private async load(): Promise<CryptoKey> {
    const storedKey = localStorage.getItem(STORAGE_KEY);
    if (storedKey) return this.importStored(storedKey);
    if (!navigator.locks) throw new Error('Web Locks is required to initialize the encryption key');
    return navigator.locks.request('easy-notebook:encryption-key', () => this.initialize());
  }

  private async initialize(): Promise<CryptoKey> {
    // Another tab may have initialized the key while this request waited for ownership.
    const storedKey = localStorage.getItem(STORAGE_KEY);
    if (storedKey) return this.importStored(storedKey);
    const key = await window.crypto.subtle.generateKey(
      { name: ALGORITHM, length: KEY_LENGTH },
      true,
      ['encrypt', 'decrypt']
    );
    const exportedKey = await window.crypto.subtle.exportKey('raw', key);
    localStorage.setItem(STORAGE_KEY, btoa(String.fromCharCode(...new Uint8Array(exportedKey))));
    return key;
  }
}

const encryptionKeys = new EncryptionKeyProvider();

/**
 * 加密文本
 * @param {string} text - 要加密的文本
 * @returns {Promise<string>} - 加密后的 Base64 字符串
 */
export const encrypt = async (text: string): Promise<string> => {
  try {
    if (!text) return '';

    const key: CryptoKey = await encryptionKeys.get();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
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
    const encryptedArray = new Uint8Array(iv.length + encryptedData.byteLength);
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

    const key: CryptoKey = await encryptionKeys.get();
    const decoder: TextDecoder = new TextDecoder();

    // 解析 Base64 并分离 IV 和加密数据
    const encryptedArray = Uint8Array.from(atob(encryptedText), (c: string) => c.charCodeAt(0));
    const iv = encryptedArray.slice(0, 12);
    const data = encryptedArray.slice(12);

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
    const testText = 'Hello, World!';

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
