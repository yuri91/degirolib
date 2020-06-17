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
};
class Degiro {
	sessionid: string | undefined;
	config: APIConfig | undefined;
	constructor() {
	}

	async login(user: string, password: string): Promise<void> {
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
		this.sessionid = cookies?.split(';')[0].split('=')[1];
	}
	async loadSession(path: string): Promise<void> {
		const decoder = new TextDecoder("utf-8");
		const data = await Deno.readFile(path);
		this.sessionid = decoder.decode(data);
	}
	async saveSession(path: string): Promise<void> {
		const encoder = new TextEncoder();
		const data = encoder.encode(this.sessionid);
		await Deno.writeFile(path, data);
	}
	async getConfig(): Promise<void> {
		const url = `${BASE_URL}/login/secure/config`;
		let res = await fetch(url, {
			headers: {Cookie: `JSESSIONID=${this.sessionid};`},
		});
		this.config = <APIConfig>((await res.json()).data);
	}
	async getClientInfo(): Promise<void> {
		const config = expect(this.config, "No config");
		const url = `${config.paUrl}client?sessionId=${this.sessionid}`;
		let res = await fetch(url);
		console.log( await res.json());
	}
}

const degiro = new Degiro();
try {
	await degiro.loadSession("session.txt");
} catch (e) {
	if (!(e instanceof Deno.errors.NotFound)) {
		throw e;
	}

	console.log("Cannot find session, performing login...");
	await degiro.login(user, pass);
	degiro.saveSession("session.txt");
}
console.log(degiro.sessionid);
