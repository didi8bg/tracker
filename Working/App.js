import React, { useEffect, useState, useRef } from 'react';
import Select from 'react-select';

export default function App() {
  const [allCoins, setAllCoins] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [trackedCoins, setTrackedCoins] = useState([]);
  const [coinData, setCoinData] = useState({});
  const [historyMap, setHistoryMap] = useState({});
  const [expandedRows, setExpandedRows] = useState([]);
  const trackedRef = useRef([]);

  useEffect(() => {
    const fetchCoins = async () => {
      try {
        const res = await fetch('http://localhost:3001/gateio/available-coins');
        const coins = await res.json();
        setAllCoins(Array.isArray(coins) ? coins : []);
      } catch (err) {
        console.error('Error fetching coin list:', err);
      }
    };
    fetchCoins();
  }, []);

  const addCoin = () => {
    if (selectedSymbol && !trackedRef.current.includes(selectedSymbol)) {
      setTrackedCoins(prev => [...prev, selectedSymbol]);
      trackedRef.current.push(selectedSymbol);
    }
    setSelectedSymbol('');
  };

  const removeCoin = (symbol) => {
    setTrackedCoins(prev => prev.filter(c => c !== symbol));
    trackedRef.current = trackedRef.current.filter(c => c !== symbol);
  };

  const toggleRow = (symbol) => {
    setExpandedRows(prev =>
      prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol]
    );
  };

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const res = await fetch('http://localhost:3001/gateio/borrow-info');
        const json = await res.json();
        const fullList = json?.data?.list || [];

        const updatedData = {};

        for (const symbol of trackedRef.current) {
          const coinInfo = fullList.find(c => c.asset.toUpperCase() === symbol.toUpperCase()) || {
            asset: symbol,
            total_lend_available: '0.00'
          };

          const available = parseFloat(coinInfo.total_lend_available || '0');
          const time = new Date().toLocaleString();

          if (available > 0.1) {
            const newEntry = { time, available: available.toFixed(2) };

            setHistoryMap(prev => {
              const existing = prev[symbol] || [];
              const updated = [...existing, newEntry];
              return { ...prev, [symbol]: updated };
            });

            await fetch('http://localhost:3001/history', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbol, entry: newEntry })
            });
          }

          updatedData[symbol] = {
            data: coinInfo,
            lastUpdated: Date.now()
          };
        }

        setCoinData(prev => ({ ...prev, ...updatedData }));
      } catch (err) {
        console.error('Error fetching borrow info:', err);
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 3000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (timestamp) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">Gate.io Borrow Tracker</h1>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-center mb-6">
        <Select
          className="text-black w-64"
          options={allCoins.map(coin => ({ label: coin, value: coin }))}
          onChange={(selected) => setSelectedSymbol(selected?.value || '')}
          placeholder="Search or select coin..."
          isClearable
        />
        <button
          onClick={addCoin}
          className="bg-green-500 px-4 py-2 rounded-md font-semibold hover:bg-green-600 transition"
        >
          Add Coin
        </button>
      </div>

      {trackedCoins.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full max-w-5xl mx-auto text-center border border-gray-700">
            <thead>
              <tr className="bg-gray-800">
                <th className="p-2 border">Asset</th>
                <th className="p-2 border">Available to Lend</th>
                <th className="p-2 border">Last Updated</th>
                <th className="p-2 border">History</th>
                <th className="p-2 border">Remove</th>
              </tr>
            </thead>
            <tbody>
              {trackedCoins.map(symbol => {
                const coin = coinData[symbol];
                const available = parseFloat(coin?.data?.total_lend_available || '0');

                return (
                  <React.Fragment key={symbol}>
                    <tr className={available > 0 ? 'bg-red-600 font-bold' : 'bg-gray-900'}>
                      <td className="p-2 border">{symbol}</td>
                      <td className="p-2 border">{available.toFixed(2)}</td>
                      <td className="p-2 border">{formatTime(coin?.lastUpdated)}</td>
                      <td className="p-2 border">
                        <button onClick={() => toggleRow(symbol)} className="text-blue-400 hover:text-blue-200">
                          {expandedRows.includes(symbol) ? 'Hide' : 'Show'}
                        </button>
                      </td>
                      <td className="p-2 border">
                        <button onClick={() => removeCoin(symbol)} className="text-red-400 hover:text-red-200">✕</button>
                      </td>
                    </tr>
                    {expandedRows.includes(symbol) && historyMap[symbol] && (
                      <tr className="bg-gray-800">
                        <td colSpan="5" className="p-4 text-left">
                          <ul className="text-sm list-disc pl-6">
                            {historyMap[symbol].map((entry, i) => (
                              <li key={i}>{entry.time} — {entry.available} available</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-center text-gray-400 mt-8">No coins being tracked. Add one above.</p>
      )}
    </div>
  );
}
