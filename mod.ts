import "https://deno.land/x/dotenv/load.ts"

function expect<T>(a: T | undefined | null, message: string): T {
	if (a === null || a === undefined) {
		throw new TypeError(message);
	}
	return a;
}
const BASE_URL = "https://trader.degiro.nl";
let user = expect(Deno.env.get('DEGIRO_USER'), "DEGIRO_USER not in env");
let pass = expect(Deno.env.get('DEGIRO_PASS'), "DEGIRO_PASS not in env");

interface APIConfig {
	tradingUrl: string,
	paUrl: string,
	reportingUrl: string,
	paymentServiceUrl: string,
	cashSolutionsUrl: string,
	productSearchUrl: string,
	dictionaryUrl: string,
	productTypesUrl: string,
	companiesServiceUrl: string,
	i18nUrl: string,
	vwdQuotecastServiceUrl: string,
	vwdNewsUrl: string,
	vwdGossipsUrl: string,
	firstLoginWizardUrl: string,
	taskManagerUrl: string,
	landingPath: string,
	betaLandingPath: string,
	mobileLandingPath: string,
	loginUrl: string,
	sessionId: string,
	clientId: number,
}

interface ClientInfo {
	id: number,
	intAccount: number,
	username: string,
	displayName: string,
	email: string,
	memberCode: string,
}

const enum DataRequest {
	Portfolio = 'portfolio',
	TotalPortfolio = 'totalPortfolio',
	Orders = 'orders',
	HistoricalOrders = 'historicalOrders',
	Transactions = 'transactions',
	Alerts = 'alerts',
	CashFunds = 'cashFunds',
}

class Session {
	id: string;
	constructor(id: string) {
		this.id = id;
	}
};
async function login(user: string, password: string): Promise<Session> {
	const url = `${BASE_URL}/login/secure/login`;
	const params = {
		username: user,
		password: password,
		isRedirectToMobile: false,
		isPassCodeReset: false,
	};

	let res = await fetch(url, {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify(params),
	});

	const cookies = res.headers.get('set-cookie');
	const id = expect(cookies?.split(';')[0].split('=')[1], "no cookie");
	return new Session(id);
}
async function loadSession(path: string): Promise<Session> {
	const decoder = new TextDecoder("utf-8");
	const data = await Deno.readFile(path);
	const id = expect(decoder.decode(data), "invalid session file").trim();
	return new Session(id);
}
async function saveSession(session: Session, path: string): Promise<void> {
	const encoder = new TextEncoder();
	const data = encoder.encode(session.id);
	await Deno.writeFile(path, data);
}
async function getConfig(session: Session): Promise<APIConfig> {
	const url = BASE_URL + '/login/secure/config';
	let res = await fetch(url, {
		headers: {Cookie: `JSESSIONID=${session.id};`},
	});
	if (res.status == 401)
		throw new Deno.errors.NotFound("invalid session id");
	return <APIConfig>((await res.json()).data);
}
async function getClientInfo(config: APIConfig): Promise<ClientInfo> {
	const url = config.paUrl + 'client?sessionId=' + config.sessionId;
	let res = await fetch(url);
	return <ClientInfo>((await res.json()).data);
}

export async function init(): Promise<Degiro> {
	let session = null;
	let config = null;
	try {
		session = await loadSession("session.txt");
		config = await getConfig(session);
	} catch (e) {
		if (!(e instanceof Deno.errors.NotFound)) {
			throw e;
		}

		console.log("Cannot find session, performing login...");
		session = await login(user, pass);
		saveSession(session, "session.txt");
		config = await getConfig(session);
	}
	let info = await getClientInfo(config)
	return new Degiro(config, info);
}

class Portfolio {
	constructor(readonly data: PositionProduct[]) {
	}
}
class Position {
	constructor(readonly id: string, readonly size: number, readonly price: number, readonly breakEvenPrice: number) {
	}
	static fromData(data: any): Position {
		let id = expect(data?.value[0]?.value, "no id");
		let size = expect(data?.value[2]?.value, "no size");
		let price = expect(data?.value[3]?.value, "no price");
		let breakEvenPrice = expect(data?.value[9]?.value, "no breakEvenPrice");
		return new Position(id, size, price, breakEvenPrice);
	}
}
class PositionProduct {
	constructor(readonly product: Product, readonly position: Position) {
	}
}
class Product {
	constructor(readonly id: string, readonly name: string, readonly isin: string, readonly symbol: string, readonly currency: string, readonly closePrice: number, readonly closePriceDate: string) {
	}
	static fromData(data: any): Product {
		let id = expect(data?.id, "no id");
		let name = expect(data?.name, "no name");
		let isin = expect(data?.isin, "no isin");
		let symbol = expect(data?.symbol, "no symbol");
		let currency = expect(data?.currency, "no currency");
		let closePrice = expect(data?.closePrice, "no closePrice");
		let closePriceDate = expect(data?.closePriceDate, "no closePriceDate");
		return new Product(id, name, isin, symbol, currency, closePrice, closePriceDate);
	}
}
class Degiro {
	config: APIConfig;
	info: ClientInfo;
	constructor(config: APIConfig, info: ClientInfo) {
		this.config = config;
		this.info = info;
	}
	async getData<T>(requested: [DataRequest]): Promise<T> {
		let options: any = {};
		for (let r of requested) {
			options[r] = 0;
		}
		const params = new URLSearchParams(options);
		return fetch(
		`${this.config.tradingUrl}v5/update/${this.info.intAccount};jsessionid=${this.config.sessionId}?${params}`
		).then(res => res.json());
	}
	async getPortfolio(): Promise<Portfolio> {
		const res = await this.getData<any>([DataRequest.Portfolio]);
		let positions = [];
		let ids = [];
		for (let r of res.portfolio.value) {
			if (r?.value[1]?.value != "PRODUCT") {
				continue;
			}
			const pos = Position.fromData(r);
			positions.push(pos);
			ids.push(pos.id);

		}
		const products = await this.getProductsByIds(ids);
		return new Portfolio(positions.map((p, i) => new PositionProduct(products[i], p)));
	}
	async getProductsByIds(ids: string[]): Promise<Product[]> {
		let res = await fetch(
			`${this.config.productSearchUrl}v5/products/info?intAccount=${this.info.intAccount}&sessionId=${this.config.sessionId}`,
			{
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify(ids.map(id => id.toString())),
			}
		);
		let data = (await res.json())?.data;
		let products = [];
		for (let id of ids) {
			products.push(Product.fromData(data[id]));
		}
		return products;
	};
}

const degiro = await init();
console.log(degiro);
const portfolio = await degiro.getPortfolio();
console.log(portfolio);

let tot = 0;
for (const p of portfolio.data) {
	tot += (p.position.price - p.position.breakEvenPrice) * p.position.size;
}
console.log("tot: ", tot);
