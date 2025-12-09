// Configuration
const JSON_FILE_URL = 'https://helloxsports.in/api/matches.json'; // Static JSON file URL
const UPDATE_INTERVAL = 30000; // 30 seconds
const LIVE_UPDATE_INTERVAL = 10000; // 10 seconds for live matches

// Global state
let containers = [];
let isUpdating = false;
let updateInterval = null;
let customMatchStates = new Map();

// Convert 24-hour to 12-hour format
function formatTo12Hour(time24) {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
}

// Get competition display name
function getCompetitionDisplayName(competitionCode) {
    const names = {
        'PL': 'PREMIER LEAGUE',
        'PD': 'LA LIGA', 
        'BL1': 'BUNDESLIGA',
        'SA': 'SERIE A',
        'FL1': 'LIGUE 1',
        'DED': 'EREDIVISIE',
        'CL': 'CHAMPIONS LEAGUE',
        'EC': 'EUROS',
        'WC': 'WORLD CUP'
    };
    return names[competitionCode] || competitionCode || 'FOOTBALL';
}

// Determine custom match status based on time
function getCustomMatchStatus(startDate, endDate) {
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (now < start) {
        return { status: 'scheduled', isLive: false, isFinished: false };
    } else if (now >= start && now <= end) {
        return { status: 'live', isLive: true, isFinished: false };
    } else {
        return { status: 'finished', isLive: false, isFinished: true };
    }
}

// Calculate countdown / status display
function updateCountdownDisplay(dateElement, targetDate, isLive, isFinished, currentTime, homeScore, awayScore, isCustom = false, gameEndDate = null) {
    if (!dateElement) return;
    
    dateElement.classList.remove('live-status', 'finished-status', 'scheduled-status', 'custom-status');
    
    // Handle custom matches with real-time status logic
    if (isCustom && targetDate && gameEndDate) {
        const now = new Date();
        const start = new Date(targetDate);
        const end = new Date(gameEndDate);
        
        if (now >= start && now <= end) {
            // Currently live
            dateElement.textContent = '● LIVE';
            dateElement.classList.add('live-status');
            return;
        } else if (now > end) {
            // Finished
            dateElement.textContent = 'Full Time';
            dateElement.classList.add('finished-status');
            return;
        }
        // If before start time, fall through to countdown logic
    }
    
    // If it's explicitly live (for API matches)
    if (isLive === true) {
        dateElement.textContent = currentTime && currentTime > 0 ? `● LIVE ${currentTime}'` : '● LIVE';
        dateElement.classList.add('live-status');
        return;
    }
    
    // Finished (for API matches)
    if (isFinished === true) {
        dateElement.textContent = 'Full Time';
        dateElement.classList.add('finished-status');
        return;
    }
    
    // Scheduled countdown
    if (!targetDate) {
        dateElement.textContent = isCustom ? 'Custom Match' : 'TBD';
        dateElement.classList.add(isCustom ? 'custom-status' : 'scheduled-status');
        return;
    }
    
    const now = new Date();
    const target = new Date(targetDate);
    const diff = target.getTime() - now.getTime();
    
    if (diff <= 0) {
        // For custom matches, check if we should transition to live
        if (isCustom && gameEndDate) {
            const end = new Date(gameEndDate);
            if (now <= end) {
                dateElement.textContent = '● LIVE';
                dateElement.classList.add('live-status');
            } else {
                dateElement.textContent = 'Full Time';
                dateElement.classList.add('finished-status');
            }
            return;
        }
        
        // For API matches
        if ((homeScore !== null && homeScore >= 0) && (awayScore !== null && awayScore >= 0)) {
            dateElement.textContent = '● LIVE';
            dateElement.classList.add('live-status');
        } else {
            dateElement.textContent = 'Starting...';
            dateElement.classList.add('live-status');
        }
        return;
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    let countdownText = '';
    if (days > 0) countdownText = `${days}d ${hours}h ${minutes}m`;
    else if (hours > 0) countdownText = `${hours}h ${minutes}m ${seconds}s`;
    else if (minutes > 0) countdownText = `${minutes}m ${seconds}s`;
    else countdownText = `${seconds}s`;
    
    dateElement.textContent = countdownText;
    
    // Apply appropriate class based on container type
    if (isCustom) {
        dateElement.classList.add('custom-status');
    } else {
        dateElement.classList.add('scheduled-status');
    }
}

// Update all countdowns
function updateAllCountdowns() {
    containers.forEach(container => {
        const dateElement = container.dateElement;
        if (!dateElement) return;
        
        // For custom containers, get dates from data attributes
        if (container.isCustom) {
            const startDate = dateElement.getAttribute('data-start');
            const endDate = dateElement.getAttribute('data-gameends');
            if (startDate) {
                // Get fresh custom status each time
                const customStatus = getCustomMatchStatus(startDate, endDate);
                const customId = dateElement.id || 'unknown';
                
                // Update stored state
                customMatchStates.set(customId, customStatus);
                
                // Update container styling immediately
                container.element.classList.remove('match-finished', 'match-scheduled', 'match-live');
                if (customStatus.isLive) {
                    container.element.classList.add('match-live');
                } else if (customStatus.isFinished) {
                    container.element.classList.add('match-finished');
                } else {
                    container.element.classList.add('match-scheduled');
                }
                
                updateCountdownDisplay(
                    dateElement,
                    startDate,
                    customStatus.isLive,
                    customStatus.isFinished,
                    null,  // No current time for custom
                    null,  // No scores for custom
                    null,
                    true,  // isCustom = true
                    endDate // gameEndDate
                );
            }
        } else if (container.currentMatch) {
            // For API containers, use match data
            const match = container.currentMatch;
            updateCountdownDisplay(
                dateElement,
                match.utcDate,
                match.isLive,
                match.isFinished,
                match.currentTime,
                match.homeScore,
                match.awayScore,
                false, // isCustom = false
                null
            );
        }
    });
}

// Init containers
function initContainers() {
    const elements = document.querySelectorAll('.containermatch');
    containers = Array.from(elements).map((el, i) => ({
        element: el,
        id: el.getAttribute('data-container-id') || (i + 1).toString(),
        isCustom: el.getAttribute("data-custom") === "true",
        homeTeam: el.querySelector('.matchname.left'),
        awayTeam: el.querySelector('.matchname.right'),
        homeLogo: el.querySelector('.matchlogo.left img'),
        awayLogo: el.querySelector('.matchlogo.right img'),
        timeElement: el.querySelector('.matchTime .stsrt'),
        dateElement: el.querySelector('.date.style.colorDefinition.size_sm'),
        infoBox: el.querySelector('.info ul'),
        currentMatch: null
    }));
}

// Match finding
function findMatchForContainer(container, matches, usedMatches) {
    if (container.dateElement?.id) {
        const match = matches.find(m => m.id.toString() === container.dateElement.id);
        if (match && !usedMatches.has(match.id)) return match;
    }
    
    const homeTeam = container.homeTeam?.textContent?.trim();
    const awayTeam = container.awayTeam?.textContent?.trim();
    
    if (homeTeam && awayTeam) {
        const match = matches.find(m => {
            const homeMatch = m.home.toLowerCase().includes(homeTeam.toLowerCase()) || 
                            homeTeam.toLowerCase().includes(m.home.toLowerCase());
            const awayMatch = m.away.toLowerCase().includes(awayTeam.toLowerCase()) || 
                            awayTeam.toLowerCase().includes(m.away.toLowerCase());
            return homeMatch && awayMatch && !usedMatches.has(m.id);
        });
        if (match) return match;
    }
    
    const available = matches.filter(m => !usedMatches.has(m.id));
    if (!available.length) return null;
    
    const live = available.filter(m => m.isLive === true);
    if (live.length) return live[0];
    
    const today = available.filter(m => m.isToday && m.isFinished !== true);
    if (today.length) return today[0];
    
    const todayFinished = available.filter(m => m.isToday && m.isFinished === true);
    if (todayFinished.length) return todayFinished[0];
    
    const tomorrow = available.filter(m => m.isTomorrow);
    if (tomorrow.length) return tomorrow[0];
    
    return available[0];
}

// Update container
function updateContainer(container, match) {
    if (!match && !container.isCustom) {
        container.element.classList.add('container-not-found');
        return;
    }
    
    container.element.classList.remove('container-not-found');
    
    if (container.isCustom) {
        console.log(`Custom container detected: ${container.id} - preserving custom content`);
        // For custom containers, update visual styling based on status
        const dateElement = container.dateElement;
        if (dateElement) {
            const customId = dateElement.id || 'unknown';
            const customState = customMatchStates.get(customId);
            
            // Update container styling based on custom match status
            container.element.classList.remove('match-finished', 'match-scheduled', 'match-live');
            if (customState) {
                if (customState.isLive) {
                    container.element.classList.add('match-live');
                } else if (customState.isFinished) {
                    container.element.classList.add('match-finished');
                } else {
                    container.element.classList.add('match-scheduled');
                }
            } else {
                container.element.classList.add('match-scheduled');
            }
        }
        return;
    }
    
    // Only update API containers below this point
    if (!match) return;
    
    // Logos
    if (container.homeLogo && match.homeLogo) {
        container.homeLogo.src = match.homeLogo;
        container.homeLogo.alt = match.home;
    }
    if (container.awayLogo && match.awayLogo) {
        container.awayLogo.src = match.awayLogo;
        container.awayLogo.alt = match.away;
    }
    
    // Team names
    if (container.homeTeam) container.homeTeam.textContent = match.home;
    if (container.awayTeam) container.awayTeam.textContent = match.away;
    
    // Time
    if (container.timeElement) {
        if (match.isLive === true) {
            const liveIndicator = match.currentTime && match.currentTime > 0 ? ` ${match.currentTime}'` : '';
            container.timeElement.innerHTML = `<b>${match.homeScore}-${match.awayScore}</b>${liveIndicator}`;
        } else if (match.isFinished === true) {
            container.timeElement.innerHTML = `<b>${match.homeScore} - ${match.awayScore}</b>`;
        } else {
            const time12 = formatTo12Hour(match.localTime);
            container.timeElement.textContent = time12;
        }
    }
    
    // Info
    if (container.infoBox) {
        let status = 'UPCOMING';
        if (match.isLive === true) status = 'LIVE';
        else if (match.isFinished === true) status = 'Finished';
        
        const competitionName = getCompetitionDisplayName(match.competitionCode);
        
        container.infoBox.innerHTML = `
            <li><span>${status}</span></li>
            <li><span><b>${competitionName}</b></span></li>
            <li><span class="lgnm">${match.matchday ? `Matchday ${match.matchday}` : match.competition}</span></li>
        `;
    }
    
    // Styling
    container.element.classList.remove('match-finished', 'match-scheduled', 'match-live');
    if (match.isLive === true) container.element.classList.add('match-live');
    else if (match.isFinished === true) container.element.classList.add('match-finished');
    else container.element.classList.add('match-scheduled');
    
    // Countdown attributes
    if (container.dateElement && match.utcDate) {
        const utcDate = new Date(match.utcDate);
        const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
        const istDateTime = istDate.toISOString().slice(0, -1) + '+05:30';
        
        container.dateElement.setAttribute('data-start', istDateTime);
        
        const endTime = new Date(utcDate.getTime() + (2.5 * 60 * 60 * 1000));
        const istEndDateTime = new Date(endTime.getTime() + (5.5 * 60 * 60 * 1000)).toISOString().slice(0, -1) + '+05:30';
        
        container.dateElement.setAttribute('data-gameends', istEndDateTime);
        
        if (match.id) container.dateElement.id = match.id.toString();
    }
    
    container.currentMatch = match;
}

// Update page title
function updatePageTitle(matches) {
    const titleElement = document.querySelector('.boxstitle strong');
    if (!titleElement) return;
    
    const liveCount = matches.filter(m => m.isLive === true).length;
    const totalCount = matches.length;
    
    titleElement.textContent = liveCount > 0 ?
        `🔴 Live Matches (${liveCount}/${totalCount})` :
        `All Matches Today (${totalCount})`;
}

// Show only error status
function showStatus(message, type = 'loading') {
    let statusEl = document.querySelector('.json-status');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.className = 'json-status';
        document.body.appendChild(statusEl);
    }
    
    // Only show error states, hide loading and success
    if (type !== 'error') {
        statusEl.style.display = 'none';
        return;
    }
    
    statusEl.className = `json-status ${type}`;
    statusEl.textContent = message;
    statusEl.style.display = 'block';
}

// Main updater - now fetches from static JSON
async function updateAllContainers() {
    if (isUpdating) return;
    isUpdating = true;
    
    try {
        // Add cache-busting parameter to ensure fresh data
        const response = await fetch(`${JSON_FILE_URL}?_t=${Date.now()}`, { cache: "no-store" });

        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.matches) {
            throw new Error(data.error || 'Invalid JSON response');
        }
        
        const matches = data.matches;
        const usedMatches = new Set();
        
        containers.forEach(container => {
            if (container.isCustom) {
                // For custom containers, just call updateContainer to handle styling
                updateContainer(container, null);
                return;
            }
            
            const match = findMatchForContainer(container, matches, usedMatches);
            if (match) usedMatches.add(match.id);
            updateContainer(container, match);
        });
        
        updatePageTitle(matches);
        
        // Hide loading status on success
        showStatus('', 'success');
        
        // Adjust update interval based on live matches
        const hasLive = matches.some(m => m.isLive === true);
        const newInterval = hasLive ? LIVE_UPDATE_INTERVAL : UPDATE_INTERVAL;
        
        if (updateInterval && updateInterval._currentInterval !== newInterval) {
            clearInterval(updateInterval);
            updateInterval = setInterval(updateAllContainers, newInterval);
            updateInterval._currentInterval = newInterval;
        }
        
    } catch (error) {
        console.error('JSON fetch failed:', error.message);
        showStatus(`Error: ${error.message}`, 'error');
        
        // Retry after 30 seconds on error
        setTimeout(updateAllContainers, 30000);
        
    } finally {
        isUpdating = false;
    }
}

// Start countdowns
function startCountdownTimers() {
    updateAllCountdowns();
    setInterval(updateAllCountdowns, 1000);
}

// Init
async function init() {
    console.log('Initializing Match Updater (Static JSON Mode)...');
    initContainers();
    
    if (!containers.length) {
        console.warn('No match containers found');
        return;
    }
    
    console.log(`Found ${containers.length} containers (${containers.filter(c => c.isCustom).length} custom)`);
    
    await updateAllContainers();
    
    updateInterval = setInterval(updateAllContainers, UPDATE_INTERVAL);
    updateInterval._currentInterval = UPDATE_INTERVAL;
    
    startCountdownTimers();
    
    window.addEventListener('beforeunload', () => {
        if (updateInterval) clearInterval(updateInterval);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
