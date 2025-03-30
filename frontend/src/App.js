import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import './index.css';
import ExpandableChartRow from './components/ExpandableChartRow';

function MainTab({ coinData, sortField, sortDirection, toggleSort, expandedRows, toggleRow }) {
  const sortData = (data) => {
    return [...data].sort((a, b) => {
      const valA = sortField === 'symbol' ? a : coinData[a]?.[sortField] ?? 0;
      const valB = sortField === 'symbol' ? b : coinData[b]?.[sortField] ?? 0;
      if (sortDirection === 'asc') return valA > valB ? 1 : -1;
      else return valA < valB ? 1 : -1;
    });
  };

  const sorted = sortData(Object.keys(coinData));

  return (
    <table className="w-full max-w-7xl mx-auto text-center border border-gray-700">
      <thead>
        <tr className="bg-gray-800">
          <th className="p-2 border cursor-pointer" onClick={() => toggleSort('symbol')}>
            Coin {sortField === 'symbol' && (sortDirection === 'asc' ? '▲' : '▼')}
          </th>
          <th className="p-2 border cursor-pointer" onClick={() => toggleSort('available')}>
            Available to Borrow {sortField === 'available' && (sortDirection === 'asc' ? '▲' : '▼')}
          </th>
          <th className="p-2 border">Hourly Interest %</th>
          <th className="p-2 border cursor-pointer" onClick={() => toggleSort('binance')}>
            Funding (Binance) {sortField === 'binance' && (sortDirection === 'asc' ? '▲' : '▼')}
          </th>
          <th className="p-2 border cursor-pointer" onClick={() => toggleSort('bybit')}>
            Funding (Bybit) {sortField === 'bybit' && (sortDirection === 'asc' ? '▲' : '▼')}
          </th>
          <th className="p-2 border cursor-pointer" onClick={() => toggleSort('gateio')}>
            Funding (Gate.io) {sortField === 'gateio' && (sortDirection === 'asc' ? '▲' : '▼')}
          </th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(symbol => {
          const data = coinData[symbol];
          if (!data) return null;

          return (
            <React.Fragment key={symbol}>
              <tr className="bg-gray-900 hover:bg-gray-800 cursor-pointer" onClick={() => toggleRow(symbol)}>
                <td className="p-2 border font-semibold">{symbol}</td>
                <td className="p-2 border">
                  {data.available?.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </td>
                <td className="p-2 border">{data.hourlyInterest?.toFixed(6)}</td>
                <td className="p-2 border text-sm">
                  {data.binance != null ? (data.binance * 100).toFixed(4) + '%' : 'X'}
                </td>
                <td className="p-2 border text-sm">
                  {data.bybit != null ? (data.bybit * 100).toFixed(4) + '%' : 'X'}
                </td>
                <td className="p-2 border text-sm">
                  {data.gateio != null ? data.gateio.toFixed(4) + '%' : 'X'}
                </td>
              </tr>
              {expandedRows[symbol] && (
                <tr>
                  <td colSpan="6" className="p-2 border bg-black">
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

function AppRoutes() {
  const navigate = useNavigate();
  const location = useLocation();

  const [coinData, setCoinData] = useState({});
  const [sortField, setSortField] = useState('symbol');
  const [sortDirection, setSortDirection] = useState('asc');
  const [expandedRows, setExpandedRows] = useState({});

  const fetchData = async () => {
    try {
      const res = await fetch('http://localhost:3028/funding-latest');
      const data = await res.json();
      const merged = {};

      for (const [symbol, entry] of Object.entries(data)) {
        merged[symbol] = {
          ...entry,
          available: entry.available ?? 0,
          hourlyInterest: entry.hourlyInterest ?? 0,
        };
      }

      setCoinData(merged);
    } catch (err) {
      console.error('❌ Failed to fetch:', err.message);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const toggleSort = (field) => {
    if (field === sortField) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">Gate.io Margin + Funding Tracker</h1>

      <div className="flex justify-center gap-6 mb-4">
        <button
          onClick={() => navigate('/main')}
          className={`px-4 py-2 rounded ${location.pathname === '/main' ? 'bg-green-600' : 'bg-gray-700'}`}
        >
          Main
        </button>
      </div>

      <Routes>
        <Route
          path="/main"
          element={
            <MainTab
              coinData={coinData}
              sortField={sortField}
              sortDirection={sortDirection}
              toggleSort={toggleSort}
              expandedRows={expandedRows}
              toggleRow={(s) => setExpandedRows(prev => ({ ...prev, [s]: !prev[s] }))}
            />
          }
        />
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
