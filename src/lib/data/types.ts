export interface ProfileLink {
	label: string;
	href: string;
	icon: string;
}

export interface Filter {
	key: string;
	label: string;
}

export interface Project {
	title: string;
	href: string;
	repo: string | null;
	/** may carry inline markup (entities, <em>) */
	desc: string;
	tags: string[];
	accent: string | null;
	/** a CSS gradient that stands in while the thumbnail loads */
	ground: string | null;
	img: string;
	video: string | null;
}

export interface Paper {
	slug: string;
	title: string;
	venue: string;
	pdf: string;
	pages: number;
	authors: string;
	abstract: string;
}

export interface MediaItem {
	href: string;
	title: string;
	short: string;
	source: string;
	img: string;
	video: boolean;
}

export interface EarlierDetail {
	title: string;
	year: string;
	/** paragraphs, each may carry inline markup */
	body: string[];
	link: { label: string; href: string } | null;
	images: string[];
}

export interface Earlier {
	title: string;
	desc: string;
	img: string;
	grey: boolean;
	href?: string;
	key?: string;
	detail?: EarlierDetail;
}

export interface ResumeEntry {
	id: string | null;
	org: string;
	when: string;
	roles: string[];
	/** markup: positions, notes */
	body: string | null;
}

export interface Resume {
	pdf: string;
	experience: ResumeEntry[];
	education: ResumeEntry[];
	honours: { year: string; html: string }[];
	skills: { label: string; icon: string; text: string }[];
}
