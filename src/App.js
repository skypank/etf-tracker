// For GitHub Pages deployment, you would typically add a "homepage" field
// and "predeploy" / "deploy" scripts to your package.json file.
// Since this environment doesn't allow direct modification of package.json,
// here's how it would look in your local project's package.json:
/*
{
  "name": "etf-tracker-app",
  "version": "0.1.0",
  "private": true,
  "homepage": "https://<YOUR_GITHUB_USERNAME>.github.io/<YOUR_REPOSITORY_NAME>",
  "dependencies": {
    // ... existing dependencies ...
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject",
    "predeploy": "npm run build",
    "deploy": "gh-pages -d build"
  },
  // ... other fields like eslintConfig, browserslist ...
}
*/
// You would also need to install 'gh-pages' as a dev dependency: npm install gh-pages --save-dev

import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, signInWithCustomToken, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';

// Global variables provided by the Canvas environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Mock Indian ETF Data - This simulates real-time data
const initialIndianEtfs = [
  { id: 'NSE001', symbol: 'NIFTYBEES', name: 'Nippon India ETF Nifty BeES', basePrice: 250.00, volumeFactor: 1.5, marketCap: '100B', fiftyTwoWeekHighBase: 260.00, fiftyTwoWeekLowBase: 200.00 },
  { id: 'NSE002', symbol: 'BANKBEES', name: 'Nippon India ETF Bank BeES', basePrice: 500.00, volumeFactor: 0.8, marketCap: '80B', fiftyTwoWeekHighBase: 550.00, fiftyTwoWeekLowBase: 420.00 },
  { id: 'NSE003', symbol: 'MON100', name: 'Motilal Oswal Nasdaq 100 ETF', basePrice: 150.00, volumeFactor: 0.5, marketCap: '60B', fiftyTwoWeekHighBase: 165.00, fiftyTwoWeekLowBase: 120.00 },
  { id: 'NSE004', symbol: 'GOLDHALF', name: 'Nippon India ETF Gold BeES', basePrice: 48.00, volumeFactor: 0.2, marketCap: '20B', fiftyTwoWeekHighBase: 52.00, fiftyTwoWeekLowBase: 40.00 },
  { id: 'NSE005', symbol: 'NX50ETF', name: 'ICICI Prudential Nifty Next 50 ETF', basePrice: 70.00, volumeFactor: 0.3, marketCap: '30B', fiftyTwoWeekHighBase: 75.00, fiftyTwoWeekLowBase: 60.00 },
];

// Main App Component
const App = () => {
  // Firebase state
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false); // To track if auth state is settled

  // ETF data state
  const [etfs, setEtfs] = useState([]);
  const [newEtfSymbol, setNewEtfSymbol] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });
  const [showModal, setShowModal] = useState(false);
  const [etfToRemove, setEtfToRemove] = useState(null);
  const [showMigrateModal, setShowMigrateModal] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  // Top Gainer/Loser state
  const [topGainerEtf, setTopGainerEtf] = useState(null);
  const [topLoserEtf, setTopLoserEtf] = useState(null);


  // Function to generate pseudo-real ETF data
  const generateEtfData = useCallback((baseEtf) => {
    // Simulate 52-week high and low with slight variations from base
    const fiftyTwoWeekHigh = (baseEtf.fiftyTwoWeekHighBase * (1 + (Math.random() * 0.02 - 0.01))).toFixed(2); // +/- 1%
    const fiftyTwoWeekLow = (baseEtf.fiftyTwoWeekLowBase * (1 + (Math.random() * 0.02 - 0.01))).toFixed(2); // +/- 1%

    let priceChange = (Math.random() * 2 - 1) * (baseEtf.basePrice * 0.01); // Up to +/- 1% of base price
    let newPrice = Math.max(0.01, baseEtf.basePrice + priceChange);

    // Ensure current price stays within 52-week high/low bounds
    newPrice = Math.min(newPrice, parseFloat(fiftyTwoWeekHigh));
    newPrice = Math.max(newPrice, parseFloat(fiftyTwoWeekLow));

    // Recalculate change based on the adjusted newPrice
    priceChange = newPrice - baseEtf.basePrice;

    const change = priceChange.toFixed(2);
    const changePercent = ((priceChange / baseEtf.basePrice) * 100).toFixed(2);
    const volume = (Math.floor(Math.random() * 50) + 10) * 100000 * baseEtf.volumeFactor; // Varied volume

    return {
      id: baseEtf.id,
      symbol: baseEtf.symbol,
      name: baseEtf.name,
      price: parseFloat(newPrice),
      change: parseFloat(change),
      changePercent: parseFloat(changePercent),
      volume: Math.floor(volume),
      marketCap: baseEtf.marketCap,
      fiftyTwoWeekHigh: parseFloat(fiftyTwoWeekHigh),
      fiftyTwoWeekLow: parseFloat(fiftyTwoWeekLow),
    };
  }, []);

  // Function to fetch (simulate) ETF data
  const fetchEtfData = useCallback(async (currentTrackedEtfs) => {
    setLoadingData(true);
    try {
      const fetchedData = initialIndianEtfs.map(generateEtfData);
      
      const updatedTrackedEtfs = currentTrackedEtfs.map(trackedEtf => {
        const foundIndianEtf = fetchedData.find(fe => fe.symbol === trackedEtf.symbol);
        return foundIndianEtf ? { ...trackedEtf, ...foundIndianEtf } : trackedEtf;
      });

      const newInitialEtfsToAdd = fetchedData.filter(
        fetchedEtf => !updatedTrackedEtfs.some(trackedEtf => trackedEtf.symbol === fetchedEtf.symbol)
      );

      return [...updatedTrackedEtfs, ...newInitialEtfsToAdd];

    } catch (error) {
      console.error("Error fetching ETF data:", error);
      setMessage({ text: "Failed to load ETF data.", type: "error" });
      return currentTrackedEtfs; // Return current state on error
    } finally {
      setLoadingData(false);
    }
  }, [generateEtfData]);

  // Calculate Top Gainer and Loser whenever etfs change
  useEffect(() => {
    if (etfs.length > 0) {
      let gainer = etfs[0];
      let loser = etfs[0];

      for (const etf of etfs) {
        if (etf.changePercent > gainer.changePercent) {
          gainer = etf;
        }
        if (etf.changePercent < loser.changePercent) {
          loser = etf;
        }
      }
      setTopGainerEtf(gainer);
      setTopLoserEtf(loser);
    } else {
      setTopGainerEtf(null);
      setTopLoserEtf(null);
    }
  }, [etfs]);


  // Initialize Firebase and set up auth listener
  useEffect(() => {
    let unsubscribeAuth;
    let unsubscribeFirestore;

    const setupFirebase = async () => {
      try {
        if (Object.keys(firebaseConfig).length === 0) {
          console.warn("Firebase config is missing. App will run in local storage only mode.");
          setDb(null);
          setAuth(null);
          setIsAuthReady(true);
          // Load from local storage immediately if no firebase config
          const storedEtfs = localStorage.getItem('etfTrackerData');
          const localEtfs = storedEtfs ? JSON.parse(storedEtfs) : [];
          setEtfs(localEtfs); // Set initial state
          const updatedEtfs = await fetchEtfData(localEtfs); // Fetch simulated data
          setEtfs(updatedEtfs);
          return;
        }

        const app = initializeApp(firebaseConfig);
        const authInstance = getAuth(app);
        const firestoreInstance = getFirestore(app);

        setAuth(authInstance);
        setDb(firestoreInstance);

        // Authenticate with custom token or anonymously
        if (initialAuthToken) {
          await signInWithCustomToken(authInstance, initialAuthToken)
            .catch((error) => {
              console.error("Error signing in with custom token:", error);
              signInAnonymously(authInstance); // Fallback to anonymous
            });
        } else {
          await signInAnonymously(authInstance);
        }

        unsubscribeAuth = onAuthStateChanged(authInstance, async (user) => {
          setCurrentUser(user);
          setIsAuthReady(true); // Auth state is now ready

          let userEtfsFromStorageOrFirestore = [];

          if (user) {
            // User logged in, set up Firestore listener
            const userDocRef = doc(firestoreInstance, 'artifacts', appId, 'users', user.uid, 'etfData', 'userETFs');

            // Check if document exists for the user
            const docSnap = await getDoc(userDocRef);

            if (docSnap.exists()) {
              userEtfsFromStorageOrFirestore = docSnap.data().etfs || [];
            } else {
              // If no data in Firestore for this user, check localStorage for migration
              const storedEtfs = localStorage.getItem('etfTrackerData');
              if (storedEtfs && JSON.parse(storedEtfs).length > 0) {
                userEtfsFromStorageOrFirestore = JSON.parse(storedEtfs);
                setShowMigrateModal(true); // Show migration modal
              } else {
                userEtfsFromStorageOrFirestore = []; // No data in Firestore or localStorage
              }
            }

            // Fetch initial simulated data
            const fetchedSimulatedEtfs = await fetchEtfData(userEtfsFromStorageOrFirestore);
            setEtfs(fetchedSimulatedEtfs);

            // Set up real-time listener for Firestore data
            unsubscribeFirestore = onSnapshot(userDocRef, async (snapshot) => {
              const firestoreEtfs = snapshot.exists() ? (snapshot.data().etfs || []) : [];
              const updatedEtfs = await fetchEtfData(firestoreEtfs);
              setEtfs(updatedEtfs);
            }, (error) => {
              console.error("Error fetching real-time updates:", error);
              setMessage({ text: "Error syncing data from cloud.", type: "error" });
            });

          } else {
            // User logged out, load from localStorage
            if (unsubscribeFirestore) {
              unsubscribeFirestore(); // Stop listening to Firestore
            }
            const storedEtfs = localStorage.getItem('etfTrackerData');
            userEtfsFromStorageOrFirestore = storedEtfs ? JSON.parse(storedEtfs) : [];
            const fetchedSimulatedEtfs = await fetchEtfData(userEtfsFromStorageOrFirestore);
            setEtfs(fetchedSimulatedEtfs);
          }
        });
      } catch (error) {
        console.error("Error initializing Firebase:", error);
        setMessage({ text: "Failed to initialize Firebase. Data may not persist.", type: "error" });
        setIsAuthReady(true);
        const storedEtfs = localStorage.getItem('etfTrackerData');
        const localEtfs = storedEtfs ? JSON.parse(storedEtfs) : [];
        setEtfs(localEtfs); // Set initial state
        const updatedEtfs = await fetchEtfData(localEtfs); // Fetch simulated data
        setEtfs(updatedEtfs);
      }
    };

    setupFirebase();

    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubscribeFirestore) unsubscribeFirestore();
    };
  }, [fetchEtfData]); // Depend on fetchEtfData


  // Migrate local data to Firestore
  const migrateLocalDataToFirestore = async () => {
    if (!currentUser || !db) {
      setMessage({ text: "Not logged in or Firebase not ready.", type: "error" });
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
      return;
    }
    try {
      const storedEtfs = localStorage.getItem('etfTrackerData');
      if (storedEtfs) {
        const localEtfs = JSON.parse(storedEtfs);
        const userDocRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'etfData', 'userETFs');
        await setDoc(userDocRef, { etfs: localEtfs });
        setEtfs(localEtfs); // Update state to migrated data
        localStorage.removeItem('etfTrackerData'); // Clear local storage after migration
        setMessage({ text: 'Local data migrated to your account!', type: 'success' });
      }
    } catch (error) {
      console.error("Error migrating data:", error);
      setMessage({ text: "Failed to migrate local data to cloud.", type: "error" });
    } finally {
      setShowMigrateModal(false);
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    }
  };

  // Function to add a new ETF (using mock data for simplicity)
  const addEtf = async () => {
    const symbol = newEtfSymbol.trim().toUpperCase();
    if (!symbol) {
      setMessage({ text: 'Please enter an ETF symbol.', type: 'error' });
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
      return;
    }
    if (etfs.some(etf => etf.symbol === symbol)) {
      setMessage({ text: `${symbol} is already in your list.`, type: 'error' });
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
      return;
    }

    let newEtf;
    const foundInitialEtf = initialIndianEtfs.find(etf => etf.symbol === symbol);

    if (foundInitialEtf) {
      // If it's a known Indian ETF, generate its simulated data
      newEtf = generateEtfData(foundInitialEtf);
    } else {
      // Otherwise, generate generic mock data for unknown symbols
      const id = (Math.random() * 1000000).toFixed(0);
      newEtf = {
        id: id,
        symbol: symbol,
        name: `${symbol} ETF (Generic Mock)`,
        price: (Math.random() * 100 + 100).toFixed(2), // Random price between 100 and 200
        change: (Math.random() * 5 - 2.5).toFixed(2), // Random change between -2.5 and 2.5
        changePercent: (Math.random() * 1 - 0.5).toFixed(2), // Random change percent between -0.5 and 0.5
        volume: (Math.floor(Math.random() * 50) + 10) * 100000, // Random volume
        marketCap: `${(Math.random() * 100 + 10).toFixed(0)}B`, // Random market cap
        fiftyTwoWeekHigh: (Math.random() * 100 + 200).toFixed(2), // Simulated 52-week high
        fiftyTwoWeekLow: (Math.random() * 50 + 50).toFixed(2), // Simulated 52-week low
      };
    }

    const updatedEtfs = [...etfs, newEtf];

    if (currentUser && db) {
      try {
        const userDocRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'etfData', 'userETFs');
        await setDoc(userDocRef, { etfs: updatedEtfs });
        setMessage({ text: `${symbol} added and saved to cloud!`, type: 'success' });
      } catch (error) {
        console.error("Error adding ETF to Firestore:", error);
        setMessage({ text: `Failed to save ${symbol} to cloud.`, type: 'error' });
        // Fallback to local state if Firestore fails
        setEtfs(updatedEtfs);
      }
    } else {
      setEtfs(updatedEtfs);
      localStorage.setItem('etfTrackerData', JSON.stringify(updatedEtfs));
      setMessage({ text: `${symbol} added locally. Log in to save.`, type: 'success' });
    }

    setNewEtfSymbol('');
    setTimeout(() => setMessage({ text: '', type: '' }), 3000);
  };

  // Function to handle removal confirmation
  const confirmRemoveEtf = (id) => {
    const etf = etfs.find(e => e.id === id);
    if (etf) {
      setEtfToRemove(etf);
      setShowModal(true);
    }
  };

  // Function to remove an ETF
  const removeEtf = async () => {
    if (etfToRemove) {
      const updatedEtfs = etfs.filter(etf => etf.id !== etfToRemove.id);

      if (currentUser && db) {
        try {
          const userDocRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'etfData', 'userETFs');
          await setDoc(userDocRef, { etfs: updatedEtfs });
          setMessage({ text: `${etfToRemove.symbol} removed from cloud!`, type: 'success' });
        } catch (error) {
          console.error("Error removing ETF from Firestore:", error);
          setMessage({ text: `Failed to remove ${etfToRemove.symbol} from cloud.`, type: 'error' });
          // Fallback to local state if Firestore fails
          setEtfs(updatedEtfs);
        }
      } else {
        setEtfs(updatedEtfs);
        localStorage.setItem('etfTrackerData', JSON.stringify(updatedEtfs));
        setMessage({ text: `${etfToRemove.symbol} removed locally. Log in to save.`, type: 'success' });
      }

      setEtfToRemove(null);
      setShowModal(false);
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    }
  };

  // Cancel removal
  const cancelRemove = () => {
    setEtfToRemove(null);
    setShowModal(false);
  };

  // Google Sign-In and Sign-Out functions
  const signInWithGoogle = async () => {
    if (!auth) {
      setMessage({ text: "Firebase authentication not initialized.", type: "error" });
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setMessage({ text: "Signed in with Google!", type: "success" });
    } catch (error) {
      console.error("Error signing in with Google:", error);
      setMessage({ text: `Google Sign-in failed: ${error.message}`, type: "error" });
    } finally {
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    }
  };

  const signOutUser = async () => {
    if (!auth) {
      setMessage({ text: "Firebase authentication not initialized.", type: "error" });
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
      return;
    }
    try {
      await signOut(auth);
      setMessage({ text: "Signed out successfully!", type: "success" });
    } catch (error) {
      console.error("Error signing out:", error);
      setMessage({ text: `Sign out failed: ${error.message}`, type: "error" });
    } finally {
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 to-blue-100 font-inter p-4 sm:p-6 lg:p-8 flex flex-col items-center">
      {/* Header */}
      <header className="w-full max-w-4xl bg-white rounded-xl shadow-lg p-6 mb-8 text-center border-b-4 border-purple-500 flex flex-col sm:flex-row justify-between items-center">
        <div className="text-center sm:text-left">
          <h1 className="text-4xl font-extrabold text-gray-800 tracking-tight">
            ETF Tracker
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            Monitor your favorite Exchange Traded Funds (Indian Market Simulated)
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex flex-col items-center sm:items-end">
          {isAuthReady ? (
            currentUser ? (
              <>
                <p className="text-gray-700 text-sm mb-2">
                  Welcome, <span className="font-semibold">{currentUser.displayName || currentUser.email || 'Anonymous'}</span>!
                </p>
                <p className="text-gray-500 text-xs mb-2 break-all">
                  User ID: {currentUser.uid}
                </p>
                <button
                  onClick={signOutUser}
                  className="px-4 py-2 bg-red-500 text-white font-bold rounded-lg shadow-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 transition duration-200 ease-in-out"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={signInWithGoogle}
                className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 transition duration-200 ease-in-out"
              >
                Sign In with Google
              </button>
            )
          ) : (
            <p className="text-gray-500">Loading authentication...</p>
          )}
        </div>
      </header>

      {/* Add ETF Section */}
      <section className="w-full max-w-4xl bg-white rounded-xl shadow-lg p-6 mb-8">
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">Add New ETF</h2>
        <p className="text-gray-600 text-sm mb-4">Try adding symbols like NIFTYBEES, BANKBEES, MON100, GOLDHALF, NX50ETF for simulated NSE data.</p>
        <div className="flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-400 focus:border-transparent transition duration-200"
            placeholder="Enter ETF Symbol (e.g., NIFTYBEES)"
            value={newEtfSymbol}
            onChange={(e) => setNewEtfSymbol(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                addEtf();
              }
            }}
          />
          <button
            onClick={addEtf}
            className="px-6 py-3 bg-purple-600 text-white font-bold rounded-lg shadow-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-opacity-75 transition duration-200 ease-in-out transform hover:scale-105"
          >
            Add ETF
          </button>
        </div>
        {message.text && (
          <div
            className={`mt-4 p-3 rounded-lg text-center ${
              message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}
      </section>

      {/* Top Gainer/Loser Section */}
      <section className="w-full max-w-4xl bg-white rounded-xl shadow-lg p-6 mb-8">
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">Market Snapshot</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <h3 className="text-lg font-semibold text-green-700 mb-2">Top Gainer</h3>
            {topGainerEtf ? (
              <p className="text-gray-800">
                <span className="font-bold">{topGainerEtf.symbol}:</span> ₹{topGainerEtf.price.toFixed(2)} (
                <span className="text-green-600">↑{Math.abs(topGainerEtf.change).toFixed(2)} / {topGainerEtf.changePercent.toFixed(2)}%</span>)
              </p>
            ) : (
              <p className="text-gray-500">N/A</p>
            )}
          </div>
          <div className="bg-red-50 p-4 rounded-lg border border-red-200">
            <h3 className="text-lg font-semibold text-red-700 mb-2">Top Loser</h3>
            {topLoserEtf ? (
              <p className="text-gray-800">
                <span className="font-bold">{topLoserEtf.symbol}:</span> ₹{topLoserEtf.price.toFixed(2)} (
                <span className="text-red-600">↓{Math.abs(topLoserEtf.change).toFixed(2)} / {topLoserEtf.changePercent.toFixed(2)}%</span>)
              </p>
            ) : (
              <p className="text-gray-500">N/A</p>
            )}
          </div>
        </div>
      </section>

      {/* ETF List Section */}
      <section className="w-full max-w-4xl bg-white rounded-xl shadow-lg p-6 overflow-x-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold text-gray-700">Tracked ETFs</h2>
          <button
            onClick={async () => {
              const updatedEtfs = await fetchEtfData(etfs);
              setEtfs(updatedEtfs);
              setMessage({ text: 'ETF data refreshed!', type: 'success' });
              setTimeout(() => setMessage({ text: '', type: '' }), 3000);
            }}
            disabled={loadingData}
            className="px-4 py-2 bg-green-500 text-white font-bold rounded-lg shadow-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400 transition duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingData ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
        {etfs.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No ETFs tracked yet. Add some above!</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tl-lg">Symbol</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Change</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vol.</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mkt Cap</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">52-W High</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">52-W Low</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tr-lg">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {etfs.map((etf) => (
                <tr key={etf.id} className="hover:bg-gray-50 transition duration-150">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{etf.symbol}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{etf.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 font-semibold">₹{etf.price.toFixed(2)}</td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm ${etf.change >= 0 ? 'text-green-600' : 'text-red-600'} font-medium`}>
                    {etf.change >= 0 ? '↑' : '↓'} {Math.abs(etf.change).toFixed(2)} ({etf.changePercent.toFixed(2)}%)
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{(etf.volume / 1000000).toFixed(1)}M</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{etf.marketCap}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">₹{etf.fiftyTwoWeekHigh?.toFixed(2) || 'N/A'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">₹{etf.fiftyTwoWeekLow?.toFixed(2) || 'N/A'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => confirmRemoveEtf(etf.id)}
                      className="text-red-600 hover:text-red-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 rounded-md px-3 py-1 bg-red-100 hover:bg-red-200 transition duration-150"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Confirmation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm flex flex-col items-center">
            <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">Confirm Removal</h3>
            <p className="text-gray-600 mb-6 text-center">Are you sure you want to remove <span className="font-semibold">{etfToRemove?.symbol}</span> from your list?</p>
            <div className="flex gap-4 w-full justify-center">
              <button
                onClick={removeEtf}
                className="px-6 py-2 bg-red-600 text-white font-bold rounded-lg shadow-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-75 transition duration-200"
              >
                Yes, Remove
              </button>
              <button
                onClick={cancelRemove}
                className="px-6 py-2 bg-gray-300 text-gray-800 font-bold rounded-lg shadow-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-opacity-75 transition duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Local Data Migration Modal */}
      {showMigrateModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm flex flex-col items-center">
            <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">Migrate Local Data?</h3>
            <p className="text-gray-600 mb-6 text-center">
              It looks like you have some ETF data saved locally. Would you like to migrate it to your Google account for persistent storage?
            </p>
            <div className="flex gap-4 w-full justify-center">
              <button
                onClick={migrateLocalDataToFirestore}
                className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 transition duration-200"
              >
                Yes, Migrate
              </button>
              <button
                onClick={() => {
                  setShowMigrateModal(false);
                  localStorage.removeItem('etfTrackerData'); // Clear local data if not migrating
                  setMessage({ text: "Local data cleared. Using cloud data now.", type: "info" });
                  setTimeout(() => setMessage({ text: '', type: '' }), 3000);
                }}
                className="px-6 py-2 bg-gray-300 text-gray-800 font-bold rounded-lg shadow-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-opacity-75 transition duration-200"
              >
                No, Use Cloud Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;

