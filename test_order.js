const order = async () => {
  const loginRes = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
  });
  const data = await loginRes.json();
  const token = data.token;
  const res = await fetch('http://localhost:3001/api/trading/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ ticker: 'AAPL', type: 'LIMIT', side: 'BUY', quantity: 10, price: 500 })
  });
  console.log(await res.json());
};
order();
