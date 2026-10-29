import { finance } from '../src/finance.js';

const client = finance();
const quote = await client.quote('GOOGL:NASDAQ');
console.log({ name: quote.name, price: quote.price, currency: quote.currency, time: quote.time, extendedMarket: quote.extendedMarket, delayStatus: quote.delayStatus });

const suggestions = await client.search('Microsoft');
console.log(suggestions.matches.map(match => ({ ...match.instrument, name: match.name })));

const chart = await client.chart('GOOGL:NASDAQ', { range: '1M' });
console.log(chart.sessions.flatMap(session => session.points).map(({ time, price, volume }) => ({ time, price, volume })));
