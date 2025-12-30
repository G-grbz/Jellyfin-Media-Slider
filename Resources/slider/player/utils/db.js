import { musicPlayerState } from "../core/state.js";

export class MusicDB {
    constructor() {
        this.dbName = 'GMMP-MusicDB';
        this.dbVersion = 2;
        this.storeName = 'tracks';
        this.deletedStoreName = 'deletedTracks';
        this.lyricsStoreName = 'lyrics';
        this.db = null;
    }

    async openDB() {
        return new Promise((resolve, reject) => {
            if (this.db) return resolve(this.db);

            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                let store;

                if (!db.objectStoreNames.contains(this.storeName)) {
                    store = db.createObjectStore(this.storeName, { keyPath: 'Id' });
                } else {
                    store = event.currentTarget.transaction.objectStore(this.storeName);
                }

                if (!store.indexNames.contains('DateCreated'))
                    store.createIndex('DateCreated', 'DateCreated', { unique: false });

                if (!store.indexNames.contains('Album'))
                    store.createIndex('Album', 'Album', { unique: false });

                if (!store.indexNames.contains('Artists'))
                    store.createIndex('Artists', 'Artists', { multiEntry: true });

                if (!store.indexNames.contains('LastUpdated'))
                    store.createIndex('LastUpdated', 'LastUpdated', { unique: false });

                if (!db.objectStoreNames.contains(this.lyricsStoreName)) {
                    const lyricsStore = db.createObjectStore(this.lyricsStoreName, { keyPath: 'trackId' });
                    lyricsStore.createIndex('trackId', 'trackId', { unique: true });
                    lyricsStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
                }

                if (!db.objectStoreNames.contains(this.deletedStoreName)) {
                    const deletedStore = db.createObjectStore(this.deletedStoreName, { keyPath: 'id', autoIncrement: true });
                    deletedStore.createIndex('trackId', 'trackId', { unique: false });
                    deletedStore.createIndex('deletedAt', 'deletedAt', { unique: false });
                    deletedStore.createIndex('trackData', 'trackData', { unique: false });
                }
                if (event.oldVersion < 2) {
                    const trackStore = event.currentTarget.transaction.objectStore(this.storeName);
                    trackStore.getAll().onsuccess = (e) => {
                        const tracks = e.target.result;
                        const nowIso = new Date().toISOString();
                        tracks.forEach(track => {
                            if (!track.DateCreated) {
                                track.DateCreated = track.LastUpdated || nowIso;
                                trackStore.put(track);
                            }
                        });
                    };
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error('Veritabanı açılırken hata:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async getAllTracks() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (event) => {
                console.error('Parçalar alınırken hata:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async getTracksPaginated(page = 1, pageSize = 100) {
        const allTracks = await this.getAllTracks();
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        return {
            tracks: allTracks.slice(start, end),
            total: allTracks.length,
            page,
            pageSize,
            totalPages: Math.ceil(allTracks.length / pageSize)
        };
    }

    async getLastTrack() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('DateCreated');
            const request = index.openCursor(null, 'prev');

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                resolve(cursor ? cursor.value : null);
            };
            request.onerror = (event) => {
                console.error('Son parça alınırken hata:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async getTracksByArtist(artistName, useId = false) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const indexName = useId ? 'ArtistIds' : 'Artists';

            if (!store.indexNames.contains(indexName)) {
                return resolve([]);
            }

            const index = store.index(indexName);
            const request = index.getAll(artistName);

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async saveTracks(tracks) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const now = new Date().toISOString();
        const ops = tracks.map(track => {
            return new Promise((res, rej) => {
                const getReq = store.get(track.Id);
                getReq.onsuccess = () => {
                    const existing = getReq.result;
                    if (existing && existing.DateCreated && !isNaN(Date.parse(existing.DateCreated))) {
                        track.DateCreated = existing.DateCreated;
                    } else {
                        track.DateCreated = now;
                    }
                    track.LastUpdated = now;
                    const putReq = store.put(track);
                    putReq.onsuccess = () => res();
                    putReq.onerror = () => rej(putReq.error);
                };
                getReq.onerror = () => rej(getReq.error);
            });
        });

        Promise.all(ops)
            .then(() => resolve())
            .catch(error => {
                console.error('Parçalar kaydedilirken hata:', error);
                reject(error);
            });
    });
}


    async saveTracksInBatches(tracks, batchSize = 100) {
        for (let i = 0; i < tracks.length; i += batchSize) {
            const batch = tracks.slice(i, i + batchSize);
            await this.saveTracks(batch);
        }
    }

    async addOrUpdateTracks(tracks) {
        return this.saveTracks(tracks);
    }

    async deleteTracks(ids) {
        const db = await this.openDB();
        return new Promise(async (resolve, reject) => {
            const transaction = db.transaction([this.storeName, this.deletedStoreName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const deletedStore = transaction.objectStore(this.deletedStoreName);
            const getRequests = ids.map(id => {
                return new Promise((res, rej) => {
                    const getReq = store.get(id);
                    getReq.onsuccess = () => res(getReq.result);
                    getReq.onerror = () => rej(getReq.error);
                });
            });

            try {
                const tracksToDelete = await Promise.all(getRequests);
                tracksToDelete.forEach(track => {
                    if (track) {
                        store.delete(track.Id);
                        deletedStore.add({
                            trackId: track.Id,
                            trackData: track,
                            deletedAt: new Date().toISOString()
                        });
                    }
                });

                transaction.oncomplete = () => resolve();
                transaction.onerror = (event) => {
                    console.error('Parçalar silinirken hata:', event.target.error);
                    reject(event.target.error);
                };
            } catch (error) {
                console.error('Silinecek parçalar alınırken hata:', error);
                reject(error);
            }
        });
    }

    async getRecentlyDeleted() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.deletedStoreName], 'readonly');
        const store = transaction.objectStore(this.deletedStoreName);
        const index = store.index('deletedAt');
        const request = index.openCursor(null, 'prev');

        const recent = [];
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                recent.push(cursor.value);
                cursor.continue();
            } else {
                resolve(recent);
            }
        };

        request.onerror = () => reject(request.error);
    });
}

    async deleteAllTracks() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = (event) => {
                console.error('Tüm parçalar silinirken hata:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async filterTracks(predicateFn) {
        const allTracks = await this.getAllTracks();
        return allTracks.filter(predicateFn);
    }

    async deleteTracksByFilter(predicateFn) {
        const matched = await this.filterTracks(predicateFn);
        const ids = matched.map(t => t.Id);
        return this.deleteTracks(ids);
    }

    async getTrackCount() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.count();

            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => {
                console.error('Parça sayısı alınırken hata:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async getRecentlyUpdated(limit = 250) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);

        if (!store.indexNames.contains('LastUpdated')) return resolve([]);

        const index = store.index('LastUpdated');
        const request = index.openCursor(null, 'prev');

        const recent = [];
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor && recent.length < limit) {
                recent.push(cursor.value);
                cursor.continue();
            } else {
                resolve(recent);
            }
        };

        request.onerror = () => reject(request.error);
    });
}

    async findTrackByName(nameSubstring) {
        const allTracks = await this.getAllTracks();
        const lower = nameSubstring.toLowerCase();
        return allTracks.filter(track => track.Name?.toLowerCase().includes(lower));
    }

    async groupTracksByAlbum() {
        const allTracks = await this.getAllTracks();
        const grouped = {};
        allTracks.forEach(track => {
            const album = track.Album || 'Bilinmeyen Albüm';
            if (!grouped[album]) grouped[album] = [];
            grouped[album].push(track);
        });
        return grouped;
    }

    async getUniqueArtists() {
        const allTracks = await this.getAllTracks();
        const artistSet = new Set();
        allTracks.forEach(track => {
            if (Array.isArray(track.Artists)) {
                track.Artists.forEach(a => artistSet.add(a));
            }
        });
        return Array.from(artistSet);
    }

    async getStats() {
    const allTracks = await this.getAllTracks();
    const totalTracks = allTracks.length;
    const albums = new Set();
    const artists = new Set();

    allTracks.forEach(track => {
        if (track.Album) albums.add(track.Album);
        if (Array.isArray(track.Artists)) {
            track.Artists.forEach(artist => artists.add(artist));
        }
    });

    const recentlyAdded = [...allTracks]
        .sort((a, b) => new Date(b.DateCreated) - new Date(a.DateCreated))
        .slice(0, 250);

    return {
        totalTracks,
        totalAlbums: albums.size,
        totalArtists: artists.size,
        recentlyAdded
    };
}

  async getLyrics(trackId) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.lyricsStoreName], 'readonly');
        const store = transaction.objectStore(this.lyricsStoreName);
        const request = store.get(trackId);

        request.onsuccess = () => resolve(request.result?.lyrics || null);
        request.onerror = (event) => {
            console.error('Şarkı sözleri alınırken hata:', event.target.error);
            reject(event.target.error);
        };
    });
}

async saveLyrics(trackId, lyricsData) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.lyricsStoreName], 'readwrite');
        const store = transaction.objectStore(this.lyricsStoreName);

        const lyrics = {
            trackId,
            lyrics: lyricsData,
            lastUpdated: new Date().toISOString()
        };

        const request = store.put(lyrics);

        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error('Şarkı sözleri kaydedilirken hata:', event.target.error);
            reject(event.target.error);
        };
    });
}

async deleteLyrics(trackId) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.lyricsStoreName], 'readwrite');
        const store = transaction.objectStore(this.lyricsStoreName);
        const request = store.delete(trackId);

        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error('Şarkı sözleri silinirken hata:', event.target.error);
            reject(event.target.error);
        };
    });
}

  async saveCustomLyrics(trackId, lyricsText) {
    const lyricsData = {
        text: lyricsText,
        source: 'user',
        addedAt: new Date().toISOString()
    };

    await this.saveLyrics(trackId, lyricsData);

    if (musicPlayerState.currentTrack?.Id === trackId) {
        musicPlayerState.lyricsCache[trackId] = lyricsData;
        displayLyrics(lyricsText);
            }
        }

        async getAllLyrics() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.lyricsStoreName], 'readonly');
        const store = transaction.objectStore(this.lyricsStoreName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (event) => {
            console.error('Şarkı sözleri alınırken hata:', event.target.error);
            reject(event.target.error);
        };
    });
}

    async getLyricsCount() {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.lyricsStoreName], 'readonly');
            const store = transaction.objectStore(this.lyricsStoreName);
            const request = store.count();

            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => {
                console.error('Şarkı sözü sayısı alınırken hata:', event.target.error);
                reject(event.target.error);
            };
        });
    }
}
export const musicDB = new MusicDB();
