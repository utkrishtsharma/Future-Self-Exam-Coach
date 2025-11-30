import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { Activity, BookOpen, Brain, MessageSquare, Save, Settings, Database, ExternalLink, Moon, Sun, Layers } from 'lucide-react';

// --- Configuration & Constants ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'future-self-exam-coach';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=`;
const apiKey = ""; // Runtime key provision

// --- Theme Constants (Retro Eye Comfort) ---
const THEMES = {
    amber: "bg-amber-900/90 text-amber-50 selection:bg-amber-500/30",
    sepia: "bg-[#704214]/90 text-[#fdf6e3] selection:bg-[#b58900]/30",
    matrix: "bg-gray-900/95 text-green-400 selection:bg-green-500/30"
};

// --- Utility: AI Fetch with Retry ---
const fetchWithRetry = async (url, options, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            return response;
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
        }
    }
};

// --- Component: Procedural 3D-style Avatar ---
// Lightweight SVG that animates based on "emotion" prop
const FutureAvatar = ({ emotion = 'neutral' }) => {
    const getExpression = () => {
        switch(emotion) {
            case 'happy': return { mouth: "M 35 65 Q 50 75 65 65", eyes: "M 35 45 Q 40 40 45 45 M 55 45 Q 60 40 65 45", color: "#4ade80" }; // Green glow
            case 'thinking': return { mouth: "M 40 70 Q 50 70 60 70", eyes: "M 35 40 Q 40 45 45 40 M 55 40 Q 60 35 65 40", color: "#fbbf24" }; // Amber glow
            case 'stern': return { mouth: "M 40 70 Q 50 60 60 70", eyes: "M 30 40 L 45 45 M 55 45 L 70 40", color: "#f87171" }; // Red glow
            default: return { mouth: "M 35 65 Q 50 65 65 65", eyes: "M 35 45 A 2 2 0 1 1 35 45.1 M 65 45 A 2 2 0 1 1 65 45.1", color: "#60a5fa" }; // Blue glow
        }
    };
    
    const exp = getExpression();

    return (
        <div className="relative w-24 h-24 mx-auto mb-4 transition-all duration-500">
            {/* Hologram Base Effect */}
            <div className="absolute inset-0 bg-gradient-to-t from-white/10 to-transparent rounded-full blur-xl animate-pulse"></div>
            
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-2xl filter contrast-125">
                <defs>
                    <radialGradient id="grad1" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                        <stop offset="0%" style={{stopColor: exp.color, stopOpacity: 0.3}} />
                        <stop offset="100%" style={{stopColor: "transparent", stopOpacity: 0}} />
                    </radialGradient>
                </defs>
                <circle cx="50" cy="50" r="45" fill="url(#grad1)" className="animate-pulse" />
                <path d="M 20 50 Q 50 90 80 50 Q 50 10 20 50" fill="none" stroke={exp.color} strokeWidth="0.5" className="opacity-50" />
                <path d="M 50 20 L 50 80 M 20 50 L 80 50" fill="none" stroke={exp.color} strokeWidth="0.2" className="opacity-30" />
                
                {/* Face Features */}
                <path d={exp.eyes} fill="none" stroke={exp.color} strokeWidth="3" strokeLinecap="round" className="transition-all duration-500" />
                <path d={exp.mouth} fill="none" stroke={exp.color} strokeWidth="3" strokeLinecap="round" className="transition-all duration-500" />
            </svg>
            <div className="text-center text-[10px] font-mono mt-1 opacity-70 tracking-widest uppercase">Future You</div>
        </div>
    );
};

// --- Component: Glass Card ---
const GlassCard = ({ children, className = "", title }) => (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl backdrop-blur-xl bg-white/5 transition-all duration-300 hover:bg-white/10 ${className}`}>
        {title && (
            <div className="px-5 py-3 border-b border-white/5 flex justify-between items-center bg-black/10">
                <h3 className="font-mono text-sm font-bold uppercase tracking-wider opacity-90">{title}</h3>
                <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500/50"></div>
                    <div className="w-2 h-2 rounded-full bg-yellow-500/50"></div>
                    <div className="w-2 h-2 rounded-full bg-green-500/50"></div>
                </div>
            </div>
        )}
        <div className="p-5">{children}</div>
    </div>
);

const App = () => {
    // --- State ---
    const [username, setUsername] = useState('');
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [theme, setTheme] = useState('amber');
    
    // Core Data
    const [userData, setUserData] = useState({
        goals: '',
        weaknesses: '',
        examType: 'UGC NET / KVS',
        level: 1, // Gamification
    });
    const [resources, setResources] = useState([]); // Array of {type: 'text'|'link', content: '...', title: '...'}
    const [chatHistory, setChatHistory] = useState([]);
    const [currentInput, setCurrentInput] = useState('');
    
    // AI State
    const [loading, setLoading] = useState(false);
    const [avatarEmotion, setAvatarEmotion] = useState('neutral');

    // Firebase
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);

    const chatContainerRef = useRef(null);

    // --- Initialization ---
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            setDb(getFirestore(app));
            setAuth(getAuth(app));
            // Anonymous auth to access Firestore rules
            signInAnonymously(getAuth(app)).catch(console.error);
        } catch (e) {
            console.error("Init failed", e);
        }
    }, []);

    // Scroll chat to bottom
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatHistory]);

    // --- Logic: Login & User Config ---
    const handleLogin = async (e) => {
        e.preventDefault();
        if (!username.trim() || !db) return;
        
        const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '_');
        setLoading(true);

        const userDocRef = doc(db, `artifacts/${appId}/users/${cleanUsername}`);
        
        try {
            const docSnap = await getDoc(userDocRef);
            
            // Log Admin Entry
            // In a real server, we'd grab IP. Here we simulate the log structure.
            await updateDoc(userDocRef, {
                last_login: serverTimestamp(),
                login_count: (docSnap.exists() ? docSnap.data().login_count || 0 : 0) + 1
            }).catch(async () => {
                // If doc doesn't exist, create it
                await setDoc(userDocRef, {
                    username: cleanUsername,
                    created_at: serverTimestamp(),
                    goals: '',
                    weaknesses: '',
                    resources: [],
                    login_count: 1
                });
            });

            if (docSnap.exists()) {
                const data = docSnap.data();
                setUserData({
                    goals: data.goals || '',
                    weaknesses: data.weaknesses || '',
                    examType: data.examType || 'UGC NET / KVS',
                    level: data.level || 1
                });
                setResources(data.resources || []);
            }
            
            setIsLoggedIn(true);
            
            // Initial Welcome from "Future Self"
            if (chatHistory.length === 0) {
                setChatHistory([{
                    role: 'ai',
                    text: `Welcome back, ${cleanUsername}. I remember this day. This was the day we decided to stop trying and started *winning*. I've come back from the future where we already hold that Government Seat. I have the roadmap. What aspect of our preparation shall we optimize today?`
                }]);
            }

        } catch (err) {
            console.error("Login Error", err);
            alert("Connection error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    // --- Logic: AI Interaction ---
    const handleSendMessage = async () => {
        if (!currentInput.trim() || !db) return;
        
        const userMsg = { role: 'user', text: currentInput };
        setChatHistory(prev => [...prev, userMsg]);
        setCurrentInput('');
        setLoading(true);
        setAvatarEmotion('thinking');

        // Context Builder
        const resourceContext = resources
            .map(r => r.type === 'link' ? `[Link: ${r.title}]` : `[Content: ${r.title} - ${r.content.substring(0, 300)}...]`)
            .join('\n');

        const systemPrompt = `
        IDENTITY: You are the user's "Future Self" who has successfully cracked the exam (UGC NET/KVS) with a top General Category rank. 
        TONE: Supportive, confident, slightly nostalgic (because you are looking back at your past self), rigorous, and strategic.
        GOAL: Guide the user to achieve the same success. You do not just "teach"; you "remind" them of the winning strategy "we" used.
        
        METHODOLOGY: 
        1. Use BFS (Breadth-First Search) metaphor when asking to cover wide syllabus areas.
        2. Use DFS (Depth-First Search) metaphor when diving deep into weak concepts.
        3. Break down big goals into micro-achievements.
        4. If the user asks about a topic found in the provided RESOURCES, explain it deeply.
        5. If the user inputs a large file/text, summarize the key "High Yield" points.

        USER DATA:
        Goal: ${userData.goals}
        Weakness: ${userData.weaknesses}
        Resources Available: ${resourceContext}
        `;

        try {
            const payload = {
                contents: [{ 
                    parts: [{ text: `System Context: ${systemPrompt}\n\nUser: ${userMsg.text}` }] 
                }]
            };

            const response = await fetchWithRetry(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm having trouble recalling that memory... Try again?";

            setChatHistory(prev => [...prev, { role: 'ai', text: aiText }]);
            setAvatarEmotion('happy');

            // Simulate "reading" time then return to neutral
            setTimeout(() => setAvatarEmotion('neutral'), 3000);

        } catch (e) {
            setChatHistory(prev => [...prev, { role: 'ai', text: "Connection with the timeline is unstable. (API Error)" }]);
            setAvatarEmotion('stern');
        } finally {
            setLoading(false);
        }
    };

    // --- Logic: Resource Management ---
    const addResource = async (type, content, title) => {
        if (!content) return;
        
        const newRes = { type, content, title: title || 'Untitled Resource', date: new Date().toISOString() };
        // Optimistic UI update
        const updatedResources = [...resources, newRes];
        setResources(updatedResources);
        
        // Sync to Firestore
        const userDocRef = doc(db, `artifacts/${appId}/users/${username.toLowerCase().replace(/\s+/g, '_')}`);
        await updateDoc(userDocRef, {
            resources: arrayUnion(newRes)
        });
    };

    // --- Render: Login Screen ---
    if (!isLoggedIn) {
        return (
            <div className={`min-h-screen flex items-center justify-center p-4 ${THEMES[theme]} transition-colors duration-500`}>
                <div className="max-w-md w-full relative">
                    {/* Background Glow */}
                    <div className="absolute top-0 -left-4 w-72 h-72 bg-amber-500/20 rounded-full blur-3xl mix-blend-screen animate-pulse"></div>
                    
                    <GlassCard className="border-t-4 border-amber-500/50">
                        <div className="text-center mb-8">
                            <FutureAvatar emotion="neutral" />
                            <h1 className="text-3xl font-bold font-mono tracking-tighter">FUTURE.SELF</h1>
                            <p className="text-xs opacity-60 font-mono mt-2">SECURE EXAM STRATEGY LINK UPLINK</p>
                        </div>
                        
                        <form onSubmit={handleLogin} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-wider opacity-70">Identity Key (Username)</label>
                                <input 
                                    type="text" 
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 outline-none focus:border-amber-400/50 transition-all font-mono placeholder-white/20"
                                    placeholder="ENTER_CODENAME"
                                    autoFocus
                                />
                            </div>
                            <button 
                                type="submit" 
                                disabled={loading}
                                className="w-full bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/30 text-amber-200 py-3 rounded-lg font-bold tracking-widest uppercase transition-all flex justify-center items-center gap-2 group"
                            >
                                {loading ? <span className="animate-spin">⟳</span> : <span>Initiate Sequence</span>}
                            </button>
                        </form>
                        
                        <div className="mt-6 flex justify-center gap-4 opacity-50">
                            <button onClick={() => setTheme('amber')} className="w-4 h-4 rounded-full bg-amber-600 ring-2 ring-offset-2 ring-offset-black ring-amber-600"></button>
                            <button onClick={() => setTheme('sepia')} className="w-4 h-4 rounded-full bg-[#704214] ring-2 ring-offset-2 ring-offset-black ring-[#704214]"></button>
                            <button onClick={() => setTheme('matrix')} className="w-4 h-4 rounded-full bg-green-600 ring-2 ring-offset-2 ring-offset-black ring-green-600"></button>
                        </div>
                    </GlassCard>
                </div>
            </div>
        );
    }

    // --- Render: Dashboard ---
    return (
        <div className={`min-h-screen flex flex-col md:flex-row ${THEMES[theme]} transition-colors duration-500 overflow-hidden font-sans`}>
            
            {/* Left Panel: Stats & Config (Glass UI) */}
            <aside className="w-full md:w-80 p-4 flex flex-col gap-4 border-r border-white/5 bg-black/5 overflow-y-auto">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="font-mono text-xs opacity-70">CONNECTED: {username}</span>
                </div>

                <FutureAvatar emotion={avatarEmotion} />

                {/* Quick Goals */}
                <GlassCard title="Mission Config">
                    <div className="space-y-3 text-sm">
                        <div>
                            <label className="text-xs opacity-50 uppercase">Goal</label>
                            <input 
                                className="w-full bg-transparent border-b border-white/20 py-1 focus:border-amber-400 outline-none"
                                value={userData.goals}
                                onChange={(e) => setUserData({...userData, goals: e.target.value})}
                                placeholder="e.g. UGC NET JRF"
                            />
                        </div>
                        <div>
                            <label className="text-xs opacity-50 uppercase">Weak Point (Target)</label>
                            <input 
                                className="w-full bg-transparent border-b border-white/20 py-1 focus:border-amber-400 outline-none"
                                value={userData.weaknesses}
                                onChange={(e) => setUserData({...userData, weaknesses: e.target.value})}
                                placeholder="e.g. Research Methods"
                            />
                        </div>
                    </div>
                </GlassCard>

                {/* Resource Cache */}
                <GlassCard title="Data Cache (Hierarchy)" className="flex-grow">
                    <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                            <input id="resInput" placeholder="Paste Link or Text" className="flex-grow bg-black/20 rounded px-2 text-xs border border-white/10" />
                            <button 
                                onClick={() => {
                                    const input = document.getElementById('resInput');
                                    if(input.value.startsWith('http')) addResource('link', input.value, 'External Link');
                                    else addResource('text', input.value, 'Text Note');
                                    input.value = '';
                                }}
                                className="bg-white/10 p-2 rounded hover:bg-white/20"
                            >
                                <Save size={14} />
                            </button>
                        </div>
                        <div className="mt-2 space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                            {resources.map((r, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs p-2 bg-white/5 rounded border border-white/5">
                                    {r.type === 'link' ? <ExternalLink size={12} /> : <BookOpen size={12} />}
                                    <span className="truncate flex-grow opacity-80">{r.title}</span>
                                </div>
                            ))}
                            {resources.length === 0 && <span className="text-xs opacity-30 italic">No cached data found.</span>}
                        </div>
                    </div>
                </GlassCard>
            </aside>

            {/* Main Panel: Chat & Interaction */}
            <main className="flex-grow flex flex-col relative">
                {/* Header */}
                <div className="p-4 flex justify-between items-center border-b border-white/5 bg-white/5 backdrop-blur-md z-10">
                    <h2 className="font-bold text-lg tracking-wide flex items-center gap-2">
                        <Brain size={20} className="opacity-70" />
                        <span>STRATEGY_PROTOCOL_V.2025</span>
                    </h2>
                    <div className="flex gap-2">
                         <button onClick={() => setTheme('amber')} className="p-2 hover:bg-white/10 rounded-full" title="Amber Mode"><Sun size={16} /></button>
                         <button onClick={() => setTheme('matrix')} className="p-2 hover:bg-white/10 rounded-full" title="Matrix Mode"><Activity size={16} /></button>
                         <button onClick={() => setTheme('sepia')} className="p-2 hover:bg-white/10 rounded-full" title="Sepia Mode"><Moon size={16} /></button>
                    </div>
                </div>

                {/* Chat Area */}
                <div 
                    ref={chatContainerRef}
                    className="flex-grow overflow-y-auto p-4 md:p-8 space-y-6 custom-scrollbar scroll-smooth"
                >
                    {chatHistory.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-300`}>
                            <div className={`max-w-[85%] md:max-w-[70%] p-5 rounded-2xl backdrop-blur-md shadow-lg border ${
                                msg.role === 'user' 
                                    ? 'bg-white/10 border-white/20 text-right rounded-br-none' 
                                    : 'bg-black/20 border-white/5 rounded-bl-none'
                            }`}>
                                <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                                <div className="mt-2 text-[10px] opacity-40 font-mono uppercase">
                                    {msg.role === 'user' ? 'YOU [PRESENT]' : 'YOU [FUTURE]'}
                                </div>
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div className="flex justify-start animate-pulse">
                            <div className="bg-black/10 p-4 rounded-2xl rounded-bl-none border border-white/5 flex gap-2 items-center">
                                <div className="w-2 h-2 bg-current rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-current rounded-full animate-bounce delay-75"></div>
                                <div className="w-2 h-2 bg-current rounded-full animate-bounce delay-150"></div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 md:p-6 border-t border-white/5 bg-white/5 backdrop-blur-xl">
                    <div className="relative max-w-4xl mx-auto">
                        <input
                            type="text"
                            value={currentInput}
                            onChange={(e) => setCurrentInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            placeholder="Ask your future self for the next step..."
                            className="w-full bg-black/20 border border-white/10 rounded-full py-4 pl-6 pr-14 focus:border-white/30 focus:bg-black/30 outline-none transition-all shadow-inner"
                        />
                        <button 
                            onClick={handleSendMessage}
                            disabled={loading || !currentInput.trim()}
                            className="absolute right-2 top-2 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <MessageSquare size={20} />
                        </button>
                    </div>
                </div>
            </main>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
            `}</style>
        </div>
    );
};

export default App;
