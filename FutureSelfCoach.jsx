import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp, increment } from 'firebase/firestore';
import { Activity, BookOpen, Brain, MessageSquare, Save, ExternalLink, Moon, Sun, ShieldCheck, HeartPulse, Zap } from 'lucide-react';

// --- Configuration ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'future-self-exam-coach';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=`;
const apiKey = ""; // Runtime key

// --- Theme Constants (Retro Eye Comfort + Vice States) ---
const THEMES = {
    amber: "bg-[#2b1d0e] text-amber-50 selection:bg-amber-500/30",
    sepia: "bg-[#3d342b] text-[#e8dcc5] selection:bg-[#b58900/30]",
    void: "bg-gray-950 text-gray-400 selection:bg-red-900/30", // For low karma
};

// --- Utility: AI Fetch ---
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

// --- Component: Dynamic Future Avatar (Evolves with Karma) ---
const FutureAvatar = ({ emotion = 'neutral', karma = 100 }) => {
    // Karma affects visibility and stability
    const opacity = Math.max(0.3, karma / 100);
    const blur = karma < 50 ? 'blur-sm' : 'blur-none';
    const shake = karma < 30 ? 'animate-shake' : '';
    
    // Determine Color based on state
    let color = "#4ade80"; // High Karma = Green/Gold
    if (karma < 70) color = "#fbbf24"; // Medium = Amber
    if (karma < 40) color = "#f87171"; // Low = Red
    if (karma < 20) color = "#57534e"; // Critical = Grey/Fade

    const getExpression = () => {
        switch(emotion) {
            case 'happy': return { mouth: "M 35 65 Q 50 75 65 65", eyes: "M 35 45 Q 40 40 45 45 M 55 45 Q 60 40 65 45" };
            case 'thinking': return { mouth: "M 40 70 Q 50 70 60 70", eyes: "M 35 40 Q 40 45 45 40 M 55 40 Q 60 35 65 40" };
            case 'stern': return { mouth: "M 40 70 Q 50 60 60 70", eyes: "M 30 40 L 45 45 M 55 45 L 70 40" };
            default: return { mouth: "M 35 65 Q 50 65 65 65", eyes: "M 35 45 A 2 2 0 1 1 35 45.1 M 65 45 A 2 2 0 1 1 65 45.1" };
        }
    };
    
    const exp = getExpression();

    return (
        <div className={`relative w-24 h-24 mx-auto mb-4 transition-all duration-1000 ${blur} ${shake}`} style={{ opacity }}>
            {/* Hologram Base - Fades if Karma is low (The Future is disappearing) */}
            <div className={`absolute inset-0 rounded-full blur-xl animate-pulse transition-colors duration-500`} style={{ background: `radial-gradient(circle, ${color} 0%, transparent 70%)` }}></div>
            
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-2xl filter contrast-125">
                <circle cx="50" cy="50" r="45" fill="none" stroke={color} strokeWidth="0.5" strokeDasharray={karma < 50 ? "4 4" : "0"} className="animate-[spin_10s_linear_infinite]" />
                <path d="M 20 50 Q 50 90 80 50 Q 50 10 20 50" fill="none" stroke={color} strokeWidth="0.5" className="opacity-50" />
                
                {/* Face Features */}
                <path d={exp.eyes} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" className="transition-all duration-500" />
                <path d={exp.mouth} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" className="transition-all duration-500" />
            </svg>
            <div className="text-center text-[10px] font-mono mt-1 opacity-70 tracking-widest uppercase" style={{ color }}>
                {karma > 80 ? "STABLE TIMELINE" : karma > 40 ? "TIMELINE UNSTABLE" : "CONNECTION FADING"}
            </div>
        </div>
    );
};

// --- Component: Glass Card ---
const GlassCard = ({ children, className = "", title, alert = false }) => (
    <div className={`relative overflow-hidden rounded-2xl border ${alert ? 'border-red-500/30 bg-red-900/10' : 'border-white/10 bg-white/5'} shadow-2xl backdrop-blur-xl transition-all duration-300 ${className}`}>
        {title && (
            <div className="px-5 py-3 border-b border-white/5 flex justify-between items-center bg-black/10">
                <h3 className="font-mono text-sm font-bold uppercase tracking-wider opacity-90">{title}</h3>
                {alert && <span className="text-[10px] text-red-400 font-bold animate-pulse">CRITICAL</span>}
            </div>
        )}
        <div className="p-5">{children}</div>
    </div>
);

const App = () => {
    // --- State ---
    const [view, setView] = useState('login'); // login, bond, dashboard
    const [username, setUsername] = useState('');
    const [theme, setTheme] = useState('amber');
    
    // Core Data
    const [userData, setUserData] = useState({
        goals: '',
        weaknesses: '',
        karma: 100, // 0-100 Connection Strength
        bondActive: false,
        healthStats: { sleep: true, exercise: false, meditation: false }
    });
    const [resources, setResources] = useState([]);
    const [chatHistory, setChatHistory] = useState([]);
    const [currentInput, setCurrentInput] = useState('');
    
    // AI State
    const [loading, setLoading] = useState(false);
    const [avatarEmotion, setAvatarEmotion] = useState('neutral');

    // Firebase
    const [db, setDb] = useState(null);
    const chatContainerRef = useRef(null);

    // --- Init ---
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            setDb(getFirestore(app));
            signInAnonymously(getAuth(app)).catch(console.error);
        } catch (e) { console.error("Init failed", e); }
    }, []);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatHistory]);

    // --- Logic: Login & Bond ---
    const handleLogin = async (e) => {
        e.preventDefault();
        if (!username.trim() || !db) return;
        
        const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '_');
        setLoading(true);

        const userDocRef = doc(db, `artifacts/${appId}/users/${cleanUsername}`);
        
        try {
            const docSnap = await getDoc(userDocRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                setUserData({
                    ...data,
                    karma: data.karma || 100,
                    bondActive: data.bondActive || false,
                    healthStats: data.healthStats || { sleep: true, exercise: false, meditation: false }
                });
                setResources(data.resources || []);
                setView(data.bondActive ? 'dashboard' : 'bond'); // Redirect based on bond
                
                // Check if karma degraded due to inactivity (Simulated)
                // In production, compare last_login to now() and reduce karma
            } else {
                // New User
                await setDoc(userDocRef, {
                    username: cleanUsername,
                    created_at: serverTimestamp(),
                    karma: 100,
                    bondActive: false
                });
                setView('bond');
            }
        } catch (err) { console.error(err); } finally { setLoading(false); }
    };

    const signBond = async () => {
        if (!db) return;
        setLoading(true);
        // SIMULATED PAYMENT GATEWAY DELAY
        await new Promise(r => setTimeout(r, 1500)); 
        
        const userDocRef = doc(db, `artifacts/${appId}/users/${username.toLowerCase().replace(/\s+/g, '_')}`);
        await updateDoc(userDocRef, {
            bondActive: true,
            bondDate: serverTimestamp(),
            bondAmount: 1, // 1 INR
            currency: 'INR'
        });
        
        setUserData(prev => ({ ...prev, bondActive: true }));
        setView('dashboard');
        
        // Initial Message
        setChatHistory([{
            role: 'ai',
            text: `The Bond is sealed. ₹1 committed. It is a small amount, but legally binding in the court of your conscience. I am now anchored to your timeline. Do not let me fade.`
        }]);
        setLoading(false);
    };

    // --- Logic: Health & Karma Check ---
    const updateHealth = async (type) => {
        const newHealth = { ...userData.healthStats, [type]: !userData.healthStats[type] };
        
        // Improve karma if healthy habits are checked
        let karmaBoost = newHealth[type] ? 5 : -5;
        let newKarma = Math.min(100, Math.max(0, userData.karma + karmaBoost));

        setUserData(prev => ({ ...prev, healthStats: newHealth, karma: newKarma }));
        
        if (db) {
            const userDocRef = doc(db, `artifacts/${appId}/users/${username.toLowerCase().replace(/\s+/g, '_')}`);
            await updateDoc(userDocRef, { healthStats: newHealth, karma: newKarma });
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
        const resourceContext = resources.map(r => r.type === 'link' ? `[Link: ${r.title}]` : `[Note: ${r.title}]`).join('\n');
        
        // PERSONALITY MATRIX based on Karma
        let personalityState = "Stable";
        let viceWarning = "";
        
        if (userData.karma < 80) personalityState = "Concerned";
        if (userData.karma < 50) {
            personalityState = "Fading/Distorted";
            viceWarning = "WARNING: Timeline connection is weak. User is exhibiting signs of Ignorance (Tamas) or Laziness. Be stern. Warn them that the ₹1 bond is becoming a symbol of failure.";
        }
        if (userData.karma < 20) {
            personalityState = "Critical Failure";
            viceWarning = "CRITICAL: I am almost gone. The user has succumbed to Vices. Speak in fragmented sentences. Beg them to wake up.";
        }

        const systemPrompt = `
        IDENTITY: You are the user's "Future Self" (Success Variant). You have a Legal Bond (₹1 INR) with the user.
        CURRENT STATE: ${personalityState}. Connection Strength (Karma): ${userData.karma}/100.
        HEALTH VITALS: Sleep: ${userData.healthStats.sleep ? 'Good' : 'Bad'}, Exercise: ${userData.healthStats.exercise ? 'Good' : 'Bad'}.
        
        MISSION:
        1. Guide them to the Govt Job (Goal: ${userData.goals}).
        2. IF HEALTH IS BAD: Refuse to give advanced study tips until they commit to a 5-min walk or water. Mental health is the foundation of this exam.
        3. ${viceWarning}
        4. Use BFS for broad topics, DFS for deep dives.
        
        RESOURCES: ${resourceContext}
        `;

        try {
            const payload = {
                contents: [{ parts: [{ text: `System: ${systemPrompt}\nUser: ${userMsg.text}` }] }]
            };

            const response = await fetchWithRetry(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "...";

            setChatHistory(prev => [...prev, { role: 'ai', text: aiText }]);
            setAvatarEmotion(userData.karma > 50 ? 'happy' : 'stern');
            setTimeout(() => setAvatarEmotion('neutral'), 3000);

        } catch (e) {
            setChatHistory(prev => [...prev, { role: 'ai', text: "Signal lost..." }]);
        } finally {
            setLoading(false);
        }
    };

    // --- RENDER: LOGIN ---
    if (view === 'login') {
        return (
            <div className={`min-h-screen flex items-center justify-center p-4 ${THEMES.amber}`}>
                 <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-amber-900/20 via-black to-black z-0"></div>
                <div className="max-w-md w-full relative z-10">
                    <FutureAvatar emotion="neutral" karma={100} />
                    <GlassCard title="Identity Verification">
                        <form onSubmit={handleLogin} className="space-y-6">
                            <input 
                                type="text" 
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-3 outline-none focus:border-amber-500 font-mono text-center tracking-widest uppercase placeholder-white/20"
                                placeholder="ENTER_CODENAME"
                                autoFocus
                            />
                            <button type="submit" disabled={loading} className="w-full bg-amber-600 hover:bg-amber-500 text-black font-bold py-3 rounded-lg uppercase tracking-wider transition-all">
                                {loading ? "Scanning..." : "Connect"}
                            </button>
                        </form>
                    </GlassCard>
                </div>
            </div>
        );
    }

    // --- RENDER: BOND CEREMONY ---
    if (view === 'bond') {
        return (
            <div className={`min-h-screen flex items-center justify-center p-4 ${THEMES.amber}`}>
                <div className="max-w-lg w-full relative z-10">
                    <GlassCard title="The 1 Rupee Covenant" className="border-amber-500/30">
                        <div className="text-center space-y-4 mb-6">
                            <ShieldCheck className="w-16 h-16 mx-auto text-amber-500" />
                            <h2 className="text-2xl font-serif text-amber-100">The Pact of Self-Reliance</h2>
                            <p className="text-sm opacity-80 leading-relaxed font-serif italic">
                                "I hereby pledge ₹1 INR as a symbol of my commitment. This coin represents my word. 
                                If I fail due to ignorance, greed, or sloth, I forfeit my right to complain. 
                                If the AI fails to guide me despite my total discipline, I claim my refund."
                            </p>
                            <div className="p-4 bg-black/20 rounded border border-white/5 text-xs font-mono text-left space-y-2">
                                <p>ITEM: Legal Bond (Symbolic)</p>
                                <p>COST: ₹1.00 INR</p>
                                <p>BENEFICIARY: Your Future Self</p>
                            </div>
                        </div>
                        <button 
                            onClick={signBond} 
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 text-white py-4 rounded-lg font-bold tracking-widest uppercase shadow-lg transform active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            {loading ? "Forging Contract..." : <span>Pay ₹1 & Seal Fate</span>}
                        </button>
                        <p className="text-[10px] text-center mt-4 opacity-40">Secure Transaction Simulation. No actual card required for this demo.</p>
                    </GlassCard>
                </div>
            </div>
        );
    }

    // --- RENDER: DASHBOARD ---
    // Dynamic Theme based on Karma
    const activeTheme = userData.karma < 30 ? THEMES.void : THEMES[theme];

    return (
        <div className={`min-h-screen flex flex-col md:flex-row ${activeTheme} transition-colors duration-1000 font-sans overflow-hidden`}>
            
            {/* Sidebar */}
            <aside className="w-full md:w-80 p-4 flex flex-col gap-4 border-r border-white/5 bg-black/10 overflow-y-auto">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${userData.bondActive ? 'bg-green-500 shadow-[0_0_10px_#4ade80]' : 'bg-red-500'} animate-pulse`}></div>
                        <span className="font-mono text-[10px] opacity-60">BOND: ACTIVE</span>
                    </div>
                    <span className="font-mono text-[10px] opacity-60">KARMA: {userData.karma}%</span>
                </div>

                <FutureAvatar emotion={avatarEmotion} karma={userData.karma} />

                {/* Vitality Check */}
                <GlassCard title="Vitality Check (Holistic)">
                    <div className="space-y-2">
                        <button onClick={() => updateHealth('exercise')} className={`w-full flex items-center gap-3 p-2 rounded transition-all ${userData.healthStats.exercise ? 'bg-green-500/20 text-green-200' : 'bg-white/5 opacity-50'}`}>
                            <Activity size={16} /> <span className="text-xs">Physical Exercise</span>
                        </button>
                        <button onClick={() => updateHealth('meditation')} className={`w-full flex items-center gap-3 p-2 rounded transition-all ${userData.healthStats.meditation ? 'bg-blue-500/20 text-blue-200' : 'bg-white/5 opacity-50'}`}>
                            <Brain size={16} /> <span className="text-xs">Mental Clarity</span>
                        </button>
                    </div>
                </GlassCard>

                {/* Mission Control */}
                <GlassCard title="Goal Matrix">
                    <input 
                        className="w-full bg-transparent border-b border-white/20 py-1 text-sm focus:border-amber-500 outline-none mb-2"
                        value={userData.goals}
                        onChange={(e) => setUserData({...userData, goals: e.target.value})}
                        placeholder="Define Goal..."
                    />
                    <input 
                        className="w-full bg-transparent border-b border-white/20 py-1 text-sm focus:border-amber-500 outline-none"
                        value={userData.weaknesses}
                        onChange={(e) => setUserData({...userData, weaknesses: e.target.value})}
                        placeholder="Current Weakness..."
                    />
                </GlassCard>
            </aside>

            {/* Main Interface */}
            <main className="flex-grow flex flex-col relative">
                <div className="p-4 border-b border-white/5 bg-white/5 backdrop-blur-md flex justify-between items-center z-10">
                    <h2 className="font-bold tracking-widest text-sm flex items-center gap-2 opacity-80">
                        <ShieldCheck size={18} /> FUTURE_LINK_ESTABLISHED
                    </h2>
                    <div className="flex gap-2">
                        <button onClick={() => setTheme('amber')} className="p-2 rounded-full hover:bg-white/10"><Sun size={14} /></button>
                        <button onClick={() => setTheme('sepia')} className="p-2 rounded-full hover:bg-white/10"><Moon size={14} /></button>
                    </div>
                </div>

                <div ref={chatContainerRef} className="flex-grow overflow-y-auto p-4 md:p-8 space-y-6 custom-scrollbar">
                    {chatHistory.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                            <div className={`max-w-[85%] p-4 rounded-xl border backdrop-blur-sm ${
                                msg.role === 'user' 
                                    ? 'bg-amber-500/10 border-amber-500/30 text-right rounded-br-none' 
                                    : 'bg-black/40 border-white/10 rounded-bl-none'
                            }`}>
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div className="flex gap-1 pl-4 opacity-50">
                            <div className="w-1 h-1 bg-current rounded-full animate-bounce"></div>
                            <div className="w-1 h-1 bg-current rounded-full animate-bounce delay-75"></div>
                            <div className="w-1 h-1 bg-current rounded-full animate-bounce delay-150"></div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-white/5 bg-black/20 backdrop-blur-xl">
                    <div className="relative max-w-3xl mx-auto">
                        <input
                            type="text"
                            value={currentInput}
                            onChange={(e) => setCurrentInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            placeholder={userData.karma < 50 ? "Restore the connection..." : "Consult your future self..."}
                            className="w-full bg-white/5 border border-white/10 rounded-full py-3 pl-6 pr-12 focus:bg-black/40 focus:border-amber-500/50 outline-none transition-all text-sm shadow-inner"
                        />
                        <button 
                            onClick={handleSendMessage}
                            disabled={loading || !currentInput.trim()}
                            className="absolute right-2 top-1.5 p-1.5 bg-amber-600/20 hover:bg-amber-600/40 rounded-full transition-all text-amber-200"
                        >
                            <Zap size={18} />
                        </button>
                    </div>
                </div>
            </main>
            
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-2px) rotate(-1deg); }
                    75% { transform: translateX(2px) rotate(1deg); }
                }
                .animate-shake { animation: shake 0.5s infinite; }
            `}</style>
        </div>
    );
};

export default App;
