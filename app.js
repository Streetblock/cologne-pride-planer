/**
 * MODEL-KLASSE
 * Verwaltet Daten, Favoriten und lokale Markierungen
 */
class ParadeModel {
    constructor(data) {
        this.items = data;
        this.favorites = JSON.parse(localStorage.getItem('csd_favorites_2026')) || [];
        this.tracking = JSON.parse(localStorage.getItem('csd_tracking_2026')) || {};
        this.currentFilter = 'all'; // 'all' oder 'fav'
    }

    // Favoriten
    toggleFavorite(id) {
        const index = this.favorites.indexOf(id);
        if (index > -1) {
            this.favorites.splice(index, 1);
        } else {
            this.favorites.push(id);
        }
        this.saveFavorites();
    }

    isFavorite(id) {
        return this.favorites.includes(id);
    }

    saveFavorites() {
        localStorage.setItem('csd_favorites_2026', JSON.stringify(this.favorites));
    }

    // Lokale Markierungen
    toggleTracking(id) {
        if (this.tracking[id]) {
            delete this.tracking[id];
        } else {
            this.tracking[id] = Date.now();
        }
        this.saveTracking();
    }
    
    clearTracking() {
        this.tracking = {};
        this.saveTracking();
    }

    saveTracking() {
        localStorage.setItem('csd_tracking_2026', JSON.stringify(this.tracking));
    }

    // Prognose / Stats berechnen
    getTrackingStats() {
        const trackedItems = [];
        // Hole alle getrackten Items mit ihrem tatsächlichen Listen-Index
        this.items.forEach(item => {
            if (this.tracking[item.id]) {
                trackedItems.push({ index: item.listIndex, time: this.tracking[item.id] });
            }
        });

        trackedItems.sort((a, b) => a.index - b.index);

        if (trackedItems.length < 2) {
            return { active: false, count: trackedItems.length };
        }

        // Starte dirty mit zwei entfernten Markern, spaeter robust mit mehr Daten.
        const last = trackedItems[trackedItems.length - 1];
        const minimumPairGap = 6;
        const minimumSpeedSamples = 3;

        const median = (values) => {
            const sorted = [...values].sort((a, b) => a - b);
            const middle = Math.floor(sorted.length / 2);

            return sorted.length % 2 === 0
                ? (sorted[middle - 1] + sorted[middle]) / 2
                : sorted[middle];
        };

        const collectSpeeds = () => {
            const speeds = [];

            for (let i = 1; i < trackedItems.length; i++) {
                const previous = trackedItems[i - 1];
                const current = trackedItems[i];
                const distance = current.index - previous.index;
                if (distance < minimumPairGap) continue;

                const speed = (current.time - previous.time) / distance;
                if (speed > 0) speeds.push(speed);
            }

            return speeds;
        };

        const findLatestDirtyPair = () => {
            for (let i = trackedItems.length - 1; i > 0; i--) {
                for (let j = i - 1; j >= 0; j--) {
                    const distance = trackedItems[i].index - trackedItems[j].index;
                    if (distance < minimumPairGap) continue;

                    const speed = (trackedItems[i].time - trackedItems[j].time) / distance;
                    if (speed > 0) return { speed: speed, distance: distance };
                }
            }

            return null;
        };

        const speedSamples = collectSpeeds();
        const dirtyPair = findLatestDirtyPair();

        if (!dirtyPair) {
            return {
                active: false,
                count: trackedItems.length,
                needsDistance: true,
                minimumPairGap: minimumPairGap
            };
        }

        let speedMs = dirtyPair.speed;
        let reliableSpeedCount = 1;
        let ignoredSpeedCount = 0;
        let forecastMode = 'dirty';

        if (speedSamples.length >= minimumSpeedSamples) {
            const rawMedian = median(speedSamples);
            const deviations = speedSamples.map(speed => Math.abs(speed - rawMedian));
            const medianDeviation = median(deviations);
            const maxDeviation = Math.max(60000, medianDeviation * 3);
            const filteredSpeeds = speedSamples.filter(speed => Math.abs(speed - rawMedian) <= maxDeviation);
            const reliableSpeeds = filteredSpeeds.length > 0 ? filteredSpeeds : speedSamples;

            speedMs = median(reliableSpeeds);
            reliableSpeedCount = reliableSpeeds.length;
            ignoredSpeedCount = speedSamples.length - reliableSpeeds.length;
            forecastMode = 'robust';
        }
        
        

        // Nächsten Favoriten finden
        let nextFav = null;
        let nextFavEta = null;
        
        for (let i = last.index + 1; i < this.items.length; i++) {
            const item = this.items[i];
            if (this.isFavorite(item.id)) {
                nextFav = item;
                nextFavEta = last.time + (i - last.index) * speedMs;
                break;
            }
        }

        return {
            active: true,
            count: trackedItems.length,
            lastIndex: last.index,
            lastTime: last.time,
            speed: speedMs,
            forecastMode: forecastMode,
            speedSampleCount: reliableSpeedCount,
            ignoredSpeedSampleCount: ignoredSpeedCount,
            nextFav: nextFav,
            nextFavEta: nextFavEta
        };
    }

    filterData(query, showOnlyFavs) {
        const lowerQuery = query.toLowerCase();
        return this.items.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(lowerQuery) || 
                                  item.num.includes(lowerQuery) ||
                                  item.id.toLowerCase().includes(lowerQuery);
            const matchesFav = showOnlyFavs ? this.isFavorite(item.id) : true;
            
            return matchesSearch && matchesFav;
        });
    }
}

/**
 * UI-CONTROLLER-KLASSE
 */
class UIController {
    constructor() {
        this.listContainer = document.getElementById('paradeList');
        this.counterEl = document.getElementById('counter');
        this.emptyState = document.getElementById('emptyState');
        this.trackingBanner = document.getElementById('trackingBanner');
        this.trackingText = document.getElementById('trackingText');
        this.btnResetTrack = document.getElementById('btnResetTrack');
    }

    render(data, model) {
        this.listContainer.innerHTML = '';
        this.counterEl.innerText = `${data.length} Gruppen`;

        // Tracking Statistiken holen
        const stats = model.getTrackingStats();
        this.updateTrackingBanner(stats);

        if (data.length === 0) {
            this.emptyState.classList.remove('hidden');
        } else {
            this.emptyState.classList.add('hidden');
            
            const fragment = document.createDocumentFragment();
            
            data.forEach((item, index) => {
                const isFav = model.isFavorite(item.id);
                const isTracked = !!model.tracking[item.id];
                
                let eta = null;
                // Berechne ETA nur, wenn aktiv, die Gruppe noch nicht getrackt wurde 
                // und NACH der letzten getrackten Gruppe kommt.
                if (stats.active && !isTracked && item.listIndex > stats.lastIndex) {
                    eta = stats.lastTime + (item.listIndex - stats.lastIndex) * stats.speed;
                }

                const card = this.createCard(item, isFav, isTracked, eta, index);
                fragment.appendChild(card);
            });
            
            this.listContainer.appendChild(fragment);
        }
    }

    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }

    formatDiffMinutes(timestamp) {
        const diffMs = timestamp - Date.now();
        const diffMins = Math.round(diffMs / 60000);
        if (diffMins <= 0) return "Jetzt";
        return `in ca. ${diffMins} Min`;
    }

    updateTrackingBanner(stats) {
        this.trackingBanner.className = "text-xs px-4 py-3 border-b shadow-inner flex items-center justify-between transition-colors";
        this.btnResetTrack.classList.remove('hidden');

        if (!stats.active) {
            this.trackingBanner.classList.add("bg-gray-50", "text-gray-600", "border-gray-200");
            if (stats.count === 0) {
            this.trackingText.innerHTML = "📍 Markiere Gruppen mit <b>Jetzt da!</b>, um ETAs zu berechnen.";
                this.btnResetTrack.classList.add('hidden');
            } else if (stats.count === 1) {
            this.trackingText.innerHTML = "⏳ 1 Gruppe erfasst. Markiere eine weitere für die Prognose!";
            }
            if (stats.needsDistance) {
                this.trackingText.innerHTML = `${stats.count} Gruppen erfasst. Für den ersten ETA-Start bitte zwei Marker mit mehr als ${stats.minimumPairGap - 1} Gruppen Abstand setzen.`;
            }
        } else {
            if (stats.nextFav) {
                // Highlight-Banner, wenn ein Favorit in der Zukunft liegt
                this.trackingBanner.classList.add("text-amber-900", "banner-fav-active");
                this.trackingText.innerHTML = `⭐ <b>Nächster Favorit:</b> ${stats.nextFav.id} - ${stats.nextFav.name} <b>${this.formatDiffMinutes(stats.nextFavEta)}</b> (${this.formatTime(stats.nextFavEta)})`;
            } else {
            // Normaler Prognose-Banner
                this.trackingBanner.classList.add("bg-indigo-50", "text-indigo-800", "border-indigo-200");
                const speedMin = Math.max(0.1, Math.round((stats.speed / 60000) * 10) / 10);
            this.trackingText.innerHTML = `🚀 <b>Prognose aktiv</b> (Ø ${speedMin} Min/Gruppe).`;
            }
        }
    }

    createCard(item, isFav, isTracked, etaMs, index) {
        const div = document.createElement('div');
        
        // Style anpassen, wenn die Gruppe schon vorbei ist (dimmen)
        let cardStyle = "bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex gap-3 card-enter transition-all active:scale-95";
        if (isTracked) cardStyle += " opacity-60 bg-gray-50";
        
        div.className = cardStyle;
        div.style.animationDelay = `${Math.min(index * 0.03, 0.5)}s`;

        const hasKfz = item.type.toLowerCase().includes('kfz');
        const typeIcon = hasKfz 
            ? `<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>`
            : `<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>`;

        const displayNumber = item.sub ? `<span class="text-2xl">${item.num}</span><span class="text-sm font-bold text-indigo-600">${item.sub}</span>` : `<span class="text-2xl">${item.num}</span>`;

        // Marker Button Logik
        const trackBtnClass = isTracked 
            ? "bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700" 
            : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100";
        const trackBtnText = isTracked ? "✓ Vorbei" : "📍 Jetzt da!";

        // ETA Badge generieren
        let etaHtml = "";
        if (etaMs && !isTracked) {
            etaHtml = `<span class="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs font-bold px-2 py-1 rounded border border-green-100 ml-auto">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        ETA ${this.formatTime(etaMs)}
                       </span>`;
        } else if (isTracked) {
            etaHtml = `<span class="text-xs text-gray-400 font-medium ml-auto">Schon vorbei</span>`;
        }

        div.innerHTML = `
            <div class="flex flex-col items-center gap-2">
                <div class="flex-shrink-0 w-16 h-16 ${isTracked ? 'bg-gray-200 text-gray-500' : 'bg-indigo-50 text-indigo-900'} rounded-full flex items-center justify-center font-black shadow-inner">
                    ${displayNumber}
                </div>
                <button class="fav-btn p-1 rounded-full hover:bg-gray-100 transition-colors focus:outline-none" data-id="${item.id}">
                    <svg class="w-7 h-7 ${isFav ? 'text-yellow-400 fill-current' : 'text-gray-300 hover:text-gray-400'}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                </button>
            </div>
            
            <div class="flex-1 min-w-0 flex flex-col justify-center">
                <div class="flex justify-between items-start mb-1">
                    <h2 class="text-base font-bold ${isTracked ? 'text-gray-500 line-through' : 'text-gray-900'} leading-tight pr-2">${item.name}</h2>
                </div>
                <div class="flex items-center text-xs text-gray-500 mb-3 w-full">
                    ${typeIcon}
                    <span class="ml-1 truncate">${item.type}</span>
                    ${etaHtml}
                </div>
                <div class="flex mt-auto">
                    <button class="track-btn px-3 py-1.5 rounded-lg text-sm font-bold transition-colors w-full sm:w-auto ${trackBtnClass}" data-id="${item.id}">
                        ${trackBtnText}
                    </button>
                </div>
            </div>
        `;

        return div;
    }
    
    updateTabStyles(currentFilter) {
        const btnAll = document.getElementById('btnAll');
        const btnFav = document.getElementById('btnFav');
        
        if(currentFilter === 'all') {
            btnAll.className = "filter-btn flex-1 py-2 text-sm font-medium rounded-lg bg-indigo-100 text-indigo-700 transition-colors shadow-sm";
            btnFav.className = "filter-btn flex-1 py-2 text-sm font-medium rounded-lg bg-transparent text-gray-500 hover:bg-gray-100 transition-colors";
        } else {
            btnFav.className = "filter-btn flex-1 py-2 text-sm font-medium rounded-lg bg-yellow-100 text-yellow-700 transition-colors shadow-sm";
            btnAll.className = "filter-btn flex-1 py-2 text-sm font-medium rounded-lg bg-transparent text-gray-500 hover:bg-gray-100 transition-colors";
        }
    }
}

/**
 * HAUPT-APP (Controller/Coordinator)
 */
class CSDApp {
    constructor(paradeData) {
        this.model = new ParadeModel(paradeData);
        this.ui = new UIController();
        
        this.searchInput = document.getElementById('searchInput');
        this.btnAll = document.getElementById('btnAll');
        this.btnFav = document.getElementById('btnFav');
        this.listContainer = document.getElementById('paradeList');
        this.btnResetTrack = document.getElementById('btnResetTrack');

        this.init();
    }

    init() {
        this.bindEvents();
        this.updateView();
        
        // Aktualisiere die ETAs minütlich, damit Angaben wie "in ca. 5 Min" stimmen
        setInterval(() => {
            if (this.model.getTrackingStats().active) {
                this.updateView();
            }
        }, 60000); 
    }

    bindEvents() {
        // Such-Input
        let timeout = null;
        this.searchInput.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => this.updateView(), 150);
        });

        // Tabs
        this.btnAll.addEventListener('click', () => {
            this.model.currentFilter = 'all';
            this.ui.updateTabStyles('all');
            this.updateView();
        });

        this.btnFav.addEventListener('click', () => {
            this.model.currentFilter = 'fav';
            this.ui.updateTabStyles('fav');
            this.updateView();
        });

        // Event Delegation für Buttons in der Liste
        this.listContainer.addEventListener('click', (e) => {
            // Favoriten
            const favBtn = e.target.closest('.fav-btn');
            if (favBtn) {
                const id = favBtn.getAttribute('data-id');
                this.model.toggleFavorite(id);
                this.updateView(); // Rerender um Banner ggf. zu updaten
                return;
            }

            // Marker "Jetzt da"
            const trackBtn = e.target.closest('.track-btn');
            if (trackBtn) {
                const id = trackBtn.getAttribute('data-id');
                this.model.toggleTracking(id);
                this.updateView(); 
                return;
            }
        });

        // Markierungen zurücksetzen
        this.btnResetTrack.addEventListener('click', () => {
            if(confirm('Möchtest du die gesammelten Zeiten wirklich zurücksetzen?')) {
                this.model.clearTracking();
                this.updateView();
            }
        });
    }

    updateView() {
        const query = this.searchInput.value;
        const showFavs = this.model.currentFilter === 'fav';
        const filteredData = this.model.filterData(query, showFavs);
        
        // Wichtig: Die UI erhält den Zugriff auf das Model für ETA/Marker Infos
        this.ui.render(filteredData, this.model);
    }
}

async function loadParadeData() {
    const response = await fetch('./groups.json');

    if (!response.ok) {
        throw new Error(`Gruppendaten konnten nicht geladen werden (${response.status})`);
    }

    return response.json();
}

function showStartupError(error) {
    console.error('App konnte nicht gestartet werden:', error);

    const counter = document.getElementById('counter');
    const listContainer = document.getElementById('paradeList');

    if (counter) counter.textContent = 'Fehler';
    if (listContainer) {
        listContainer.innerHTML = '<div class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-medium">Gruppendaten konnten nicht geladen werden. Bitte Seite neu laden.</div>';
    }
}

// App starten sobald das DOM geladen ist
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const paradeData = await loadParadeData();
        new CSDApp(paradeData);
    } catch (error) {
        showStartupError(error);
    }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(error => {
            console.warn('Service Worker konnte nicht registriert werden:', error);
        });
    });
}
