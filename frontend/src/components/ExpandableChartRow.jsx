import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

export default function ExpandableChartRow({ symbol }) {
  const [data, setData] = useState([]);
  const [range, setRange] = useState('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const fetchData = async () => {
    try {
      const params = new URLSearchParams();
      if (range === 'custom' && customStart && customEnd) {
        params.append('start', new Date(customStart).toISOString());
        params.append('end', new Date(customEnd).toISOString());
      } else {
        params.append('range', range);
      }

      const res = await fetch(`http://localhost:3028/api/borrow-history/${symbol}?${params}`);
      const json = await res.json();
      setData(json.candles || []);
    } catch (err) {
      console.error('❌ Failed to fetch graph data:', err.message);
    }
  };

  useEffect(() => {
    fetchData(); // Load initially
    const interval = setInterval(fetchData, 60000); // Refresh every 60s
    return () => clearInterval(interval); // Clean up
  }, [symbol, range, customStart, customEnd]);

  const formatTime = (iso) => {
    const date = new Date(iso);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;

    const candleTime = formatTime(label);
    const values = Object.fromEntries(payload.map(p => [p.dataKey, p.value]));

    return (
      <div className="bg-black text-white text-sm p-2 rounded border border-gray-700">
        <div><strong>🕒 {candleTime}</strong></div>
        {values.avgAvailable !== undefined && (
          <div>Available to Borrow: {values.avgAvailable.toFixed(2)}</div>
        )}
        {values.avgHourlyInterest !== undefined && (
          <div>Hourly Interest: {values.avgHourlyInterest.toFixed(6)}%</div>
        )}
        {values.binance !== undefined && (
          <div>Binance Funding: {values.binance.toFixed(4)}%</div>
        )}
        {values.bybit !== undefined && (
          <div>Bybit Funding: {values.bybit.toFixed(4)}%</div>
        )}
        {values.gateio !== undefined && (
          <div>Gate.io Funding: {values.gateio.toFixed(4)}%</div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-gray-900 p-4 rounded">
      <h2 className="text-lg font-bold mb-2 text-white">{symbol} - Borrow + Funding History</h2>

      {/* Time Range Selector */}
      <div className="flex gap-2 items-center text-white mb-4">
        <label>Range:</label>
        <select
          className="text-black px-2 py-1 rounded"
          value={range}
          onChange={e => setRange(e.target.value)}
        >
          <option value="1d">Last 24 hours</option>
          <option value="3d">Last 3 days</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="custom">Custom</option>
        </select>
        {range === 'custom' && (
          <>
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="text-black px-2 py-1 rounded"
            />
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="text-black px-2 py-1 rounded"
            />
          </>
        )}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 10, right: 40, left: 0, bottom: 0 }}>
          <XAxis dataKey="timestamp" tickFormatter={formatTime} minTickGap={30} />
          <YAxis yAxisId="left" stroke="#00FFFF" />
          <YAxis yAxisId="right" orientation="right" stroke="#FFD700" domain={['auto', 'auto']} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />

          {/* Borrow */}
          <Line yAxisId="left" type="monotone" dataKey="avgAvailable" stroke="#00FF99" name="Available to Borrow" dot={false} />
          <Line yAxisId="left" type="monotone" dataKey="avgHourlyInterest" stroke="#AAFFCC" name="Hourly Interest" dot={false} />

          {/* Funding Rates */}
          <Line yAxisId="right" type="monotone" dataKey="binance" stroke="#33B5FF" name="Binance Funding" dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="bybit" stroke="#FFB347" name="Bybit Funding" dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="gateio" stroke="#FF6B6B" name="Gate.io Funding" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
