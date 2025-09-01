
export class AttachmentService {
	private instanceUrl: string;
	private authToken: string;

	constructor(instanceUrl: string, authToken: string) {
		this.instanceUrl = instanceUrl;
		this.authToken = authToken;
	}

	async upload(table: string, sysId: string, file: File): Promise<any> {
		const url = `${this.instanceUrl}/api/now/attachment/file?table_name=${encodeURIComponent(table)}&table_sys_id=${encodeURIComponent(sysId)}&file_name=${encodeURIComponent(file.name)}`;
		const formData = new FormData();
		formData.append("file", file, file.name);
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Accept": "application/json",
				"Authorization": `Bearer ${this.authToken}`
			},
			body: formData
		});
		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Erro no upload: ${response.status} - ${error}`);
		}
		return await response.json();
	}

	async download(attachmentId: string): Promise<Uint8Array> {
		const url = `${this.instanceUrl}/api/now/attachment/${encodeURIComponent(attachmentId)}/file`;
		const response = await fetch(url, {
			method: "GET",
			headers: {
				"Accept": "application/octet-stream",
				"Authorization": `Bearer ${this.authToken}`
			}
		});
		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Erro no download: ${response.status} - ${error}`);
		}
		const arrayBuffer = await response.arrayBuffer();
		return new Uint8Array(arrayBuffer);
	}
}
