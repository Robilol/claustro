class DbStorage {
    constructor() {
        this.lgv = null;
        this.tunnels = null;

        // Initialisation de IndexedDB
        this.dbName = 'railwayDB';
        this.dbVersion = 1;
        this.db = null;
    }

    

    async init() {
        await this.initDB();
    }

    initDB = () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('railways')) {
                    db.createObjectStore('railways', { keyPath: 'type' });
                }
            };
        });
    };

    // Fonction pour sauvegarder les données dans IndexedDB
    saveToIndexedDB = (type, data) => {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['railways'], 'readwrite');
        const store = transaction.objectStore('railways');
        const request = store.put({ type, data, timestamp: Date.now() });
        
        request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    };

    // Fonction pour récupérer les données depuis IndexedDB
    getFromIndexedDB = (type) => {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['railways'], 'readonly');
            const store = transaction.objectStore('railways');
            const request = store.get(type);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
    });
};
}