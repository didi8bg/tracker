import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import './index.css';
import ExpandableChartRow from './components/ExpandableChartRow';

// Main Tab Component
function MainTab({ coinData, sortField, sortDirection, toggleSort, expandedRows, toggleRow }) {
  const sortData = (data) => {
    return [...data].sort((a, b) => {
      const valA = coinData[a]?.[sortField] ?? 0;
      const valB = coinData[b]?.[sortField] ?? 0;
      if (sortDirection === 'asc') return valA > valB ? 1 : -1;
      else return valA < valB ? 1 : -1;
    });
  };

  const sorted = sortData(Object.keys(coinData));

  return (
    <table className="w-full max-w-5xl mx-auto text-center border border-gray-700">
      <thead>
        <tr className="bg-gray-800">
          <th className="p-2 border cursor-pointer" onClick={() => toggleSort('symbol')}>Coin</th>
          <th className="p-2 border cursor-pointer" onClick={() => toggleSort('available')}>Available to Borrow</th>
          <th className="p-2 border">Hourly Interest %</th>
          <th className="p-2 border">Funding (B/Y/G)</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(symbol => {
          const data = coinData[symbol];
          if (!data) return null;
          const fundingStr = `Binance: ${data.binance ?? 'X'}% | Bybit: ${data.bybit ?? 'X'}% | Gate.io: ${data.gateio ?? 'X'}%`;
          return (
            <React.Fragment key={symbol}>
              <tr className="bg-gray-900 hover:bg-gray-800 cursor-pointer" onClick={() => toggleRow(symbol)}>
                <td className="p-2 border font-semibold">{symbol}</td>
                <td className="p-2 border">{data.available.toFixed(2)}</td>
                <td className="p-2 border">{data.hourlyInterest}</td>
                <td className="p-2 border text-sm">{fundingStr}</td>
              </tr>
              {expandedRows[symbol] && (
                <tr>
                  <td colSpan="4" className="p-2 border bg-black">
                    <ExpandableChartRow symbol={symbol} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// Top Movers Tab Component
function TopMoversTab({ avgPoolHours, poolDrop, fundingSpike, setAvgPoolHours, setPoolDrop, setFundingSpike, fetchTopMovers, filterMessage, topMovers, coinData, toggleSort, sortField, sortDirection, toggleRow, expandedRows }) {
  const sortData = (data) => {
    return [...data].sort((a, b) => {
      const valA = coinData[a]?.[sortField] ?? 0;
      const valB = coinData[b]?.[sortField] ?? 0;
      if (sortDirection === 'asc') return valA > valB ? 1 : -1;
      else return valA < valB ? 1 : -1;
    });
  };
  const sorted = sortData(topMovers);

  return (
    <div className="text-center">
      <div className="flex justify-center gap-4 mb-2">
        <label>Average pool (hours):</label>
        <input type="number" value={avgPoolHours} onChange={e => setAvgPoolHours(Number(e.target.value))} className="text-black px-2 py-1 rounded" />
        <label>Borrow drop %:</label>
        <input type="number" step="0.01" value={poolDrop} onChange={e => setPoolDrop(Number(e.target.value))} className="text-black px-2 py-1 rounded" />
        <label>Funding spike %:</label>
        <input type="number" step="0.01" value={fundingSpike} onChange={e => setFundingSpike(Number(e.target.value))} className="text-black px-2 py-1 rounded" />
        <button onClick={fetchTopMovers} className="bg-blue-500 px-4 py-1 rounded hover:bg-blue-600">Apply</button>
      </div>
      {filterMessage && <p className="mt-2 text-sm">{filterMessage}</p>}
      {topMovers.length === 0 ? (
        <p className="mt-6 text-gray-400">No movers found with current filter.</p>
      ) : (
        <table className="w-full max-w-5xl mx-auto text-center border border-gray-700 mt-4">
          <thead>
            <tr className="bg-gray-800">
              <th className="p-2 border cursor-pointer" onClick={() => toggleSort('symbol')}>Coin</th>
              <th className="p-2 border cursor-pointer" onClick={() => toggleSort('available')}>Available to Borrow</th>
              <th className="p-2 border">Hourly Interest %</th>
              <th className="p-2 border">Funding (B/Y/G)</th>
              <th className="p-2 border">Reason for Move</th> {/* New column for reason */}
            </tr>
          </thead>
          <tbody>
            {sorted.map(symbol => {
              const data = coinData[symbol];
              if (!data) return null;
              const fundingStr = `Binance: ${data.binance ?? 'X'}% | Bybit: ${data.bybit ?? 'X'}% | Gate.io: ${data.gateio ?? 'X'}%`;
              const reasonStr = data.reason || 'No reason specified'; // Reason for move
              return (
                <React.Fragment key={symbol}>
                  <tr className="bg-gray-900 hover:bg-gray-800 cursor-pointer" onClick={() => toggleRow(symbol)}>
                    <td className="p-2 border font-semibold">{symbol}</td>
                    <td className="p-2 border">{data.available.toFixed(2)}</td>
                    <td className="p-2 border">{data.hourlyInterest}</td>
                    <td className="p-2 border text-sm">{fundingStr}</td>
                    <td className="p-2 border text-sm">{reasonStr}</td> {/* Display the reason */}
                  </tr>
                  {expandedRows[symbol] && (
                    <tr>
                      <td colSpan="5" className="p-2 border bg-black">
                        <ExpandableChartRow symbol={symbol} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AppRoutes() {
  const navigate = useNavigate();
  const location = useLocation();

  const [coinData, setCoinData] = useState({});
  const [sortField, setSortField] = useState('symbol');
  const [sortDirection, setSortDirection] = useState('asc');
  const [topMovers, setTopMovers] = useState([]);
  const [avgPoolHours, setAvgPoolHours] = useState(2);
  const [poolDrop, setPoolDrop] = useState(0.5);
  const [fundingSpike, setFundingSpike] = useState(0.2);
  const [filterMessage, setFilterMessage] = useState('');
  const [expandedRows, setExpandedRows] = useState({});

  const fetchData = async () => {
    try {
      const res = await fetch('http://localhost:3028/funding-latest');
      const data = await res.json();
      const borrowRes = await fetch('http://localhost:3028/gateio/borrow-info');
      const borrowJson = await borrowRes.json();
      const borrowList = borrowJson?.data?.list || [];
      const merged = {};
      for (const [symbol, entry] of Object.entries(data)) {
        const borrow = borrowList.find(c => c.asset.toUpperCase() === symbol.toUpperCase());
        merged[symbol] = {
          ...entry,
          available: parseFloat(borrow?.total_lend_available || '0'),
          hourlyInterest: parseFloat(borrow?.hourly_interest || '0')
        };
      }
      setCoinData(merged);
    } catch (err) {
      console.error('❌ Failed to fetch:', err.message);
    }
  };

  const fetchTopMovers = async () => {
    try {
      const res = await fetch(`http://localhost:3028/api/top-movers?hours=${avgPoolHours}&poolDrop=${poolDrop}&funding=${fundingSpike}`);
      const json = await res.json();

      if (!Array.isArray(json)) {
        console.error('❌ Unexpected response:', json);
        setFilterMessage('❌ Backend error');
        return;
      }

      setTopMovers(json);
      setFilterMessage('✅ Filter applied');
    } catch (err) {
      console.error('❌ Failed to fetch top movers:', err.message);
      setFilterMessage('❌ Failed to apply filter');
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">Gate.io Margin + Funding Tracker</h1>

      <div className="flex justify-center gap-6 mb-4">
        <button onClick={() => navigate('/main')} className={`px-4 py-2 rounded ${location.pathname === '/main' ? 'bg-green-600' : 'bg-gray-700'}`}>Main</button>
        <button onClick={() => navigate('/topmovers')} className={`px-4 py-2 rounded ${location.pathname === '/topmovers' ? 'bg-green-600' : 'bg-gray-700'}`}>Top Movers</button>
      </div>

      <Routes>
        <Route path="/main" element={<MainTab {...{ coinData, sortField, sortDirection, toggleSort: setSortField, expandedRows, toggleRow: (s) => setExpandedRows(prev => ({ ...prev, [s]: !prev[s] })) }} />} />
        <Route path="/topmovers" element={<TopMoversTab {...{ avgPoolHours, poolDrop, fundingSpike, setAvgPoolHours, setPoolDrop, setFundingSpike, fetchTopMovers, filterMessage, topMovers, coinData, toggleSort: setSortField, sortField, sortDirection, toggleRow: (s) => setExpandedRows(prev => ({ ...prev, [s]: !prev[s] })), expandedRows }} />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}
