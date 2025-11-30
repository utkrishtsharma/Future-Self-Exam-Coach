Future Self Exam Coach - Web Application

This is a React-based Single Page Application (SPA) designed to act as a personalized exam coach. It utilizes a "Future Self" AI persona to guide users through competitive exams like UGC NET and KVS PRT.

1. Architecture Overview

The application is built on a Serverless Architecture using Firebase for the backend and React for the frontend logic.

Frontend:

Framework: React 18

Styling: Tailwind CSS (configured for "Glassmorphism" and "Retro Eye Comfort").

Icons: Lucide-React.

Animation: CSS Transitions + SVG manipulation for the procedural avatar.

Backend (Firebase):

Authentication: Anonymous Auth (simplifies entry, uses Username as key).

Database: Cloud Firestore.

Structure:

/artifacts/{appId}/users/{username}: Stores user config, goals, and resource metadata.

AI Integration:

Model: Google Gemini 2.5 Flash Preview.

Logic: Uses a system prompt to simulate a "Future Self" persona. Implements metaphorical BFS (Breadth) and DFS (Depth) strategies for study planning.

2. Key Features Implementation

A. Retro Eye Comfort & Glass UI

We use RGBA colors with high transparency (bg-amber-900/90) to create a "warm glass" effect.

Benefits: Reduces blue light emission (Amber/Sepia modes) while maintaining a modern, layered aesthetic.

The Avatar: A lightweight SVG component (FutureAvatar) that changes stroke paths based on the emotion state variable, avoiding heavy 3D library downloads.

B. Efficient Data Caching

Strategy: "Link Reference" over "Blob Storage".

If a user adds large content, the text is stored, but the UI encourages pasting links.

The resources array in Firestore stores metadata. The AI uses this context (up to token limits) to answer questions.

C. Scalability & Privacy

Privacy: No email/password required. The username acts as a unique seed.

Scalability: Firestore handles the scaling. The "config file" per user approach ensures queries are fast (fetching 1 document per session).

3. How to Run

Environment: Ensure the file FutureSelfCoach.jsx is placed in a React environment with Tailwind CSS enabled.

Dependencies: firebase, lucide-react.

API Key: The apiKey variable in the code must be populated with a valid Google Gemini API key (handled by the runtime environment in this context).

4. User Guide

Login: Enter a unique "Codename" (Username). This loads your personal .config file from the server.

Mission Config: On the left dashboard, input your specific Exam Goal and Weakness.

Chat: Speak to the AI. It will respond as you from the future.

Example: "I'm tired, should I study research methods?"

Response: "I remember feeling tired too. But we pushed through 20 questions of Research Methods that night, and that's exactly what showed up on the exam. Let's do just 15 minutes."
