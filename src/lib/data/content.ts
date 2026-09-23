// Extracted from master's index.html by the content script; edit freely.
import type { Project, Paper, MediaItem, Earlier, Resume, Filter, ProfileLink } from './types';

export const meta = {
	title: 'Neo Mohsenvand',
	description:
		'Neo Mohsenvand is an AI/ML engineer and product designer building agentic systems, realtime AI, evaluation infrastructure and local ML tools at Caterpillar.',
	h1: 'Neo Mohsenvand — AI/ML Engineer and Product Designer',
	name: 'Neo Mohsenvand',
	footer: '© 2025 Neo Mohsenvand'
};
export const bio =
	"I'm an <strong>AI/ML engineer and product designer</strong>, and Chief AI Architect for Global Finance at <strong>Caterpillar</strong>, where I advance AI adoption through original products, shared infrastructure, and engineering education. I build <strong>enterprise AI agents</strong> and the software around them: document workflows, <strong>evaluation systems</strong>, <strong>voice interfaces</strong>, and tools that bring people into decisions. I also make <strong>local AI tools</strong> and interactive educational applications for exploring agent workflows, training models, and understanding retrieval. Before Caterpillar, I led research at <strong>BrainCo</strong> and worked on machine learning for biosignals at <strong>Apple</strong>. My doctoral and part-time postdoctoral research at <strong>MIT's Media Lab</strong> explored self-supervised learning, brain-computer interfaces, and tools for human memory and attention. I hold a <strong>PhD in Media Arts and Sciences</strong> from MIT and a master's in <strong>Mathematical Modelling and Scientific Computing</strong> from <strong>Oxford</strong>. I'm drawn to the intersection of <strong>software</strong>, <strong>design</strong>, and <strong>intelligence</strong>, both artificial and biological.";
export const links: ProfileLink[] = [
	{
		label: 'GitHub',
		href: 'https://github.com/NeoVand',
		icon: 'icon-github'
	},
	{
		label: 'LinkedIn',
		href: 'https://linkedin.com/in/mohsenvand',
		icon: 'icon-linkedin'
	},
	{
		label: 'Google Scholar',
		href: 'https://scholar.google.com/citations?user=nRug1xsAAAAJ&hl=en',
		icon: 'icon-scholar'
	}
];
export const filters: Filter[] = [
	{
		key: 'all',
		label: 'All'
	},
	{
		key: 'ai',
		label: 'AI'
	},
	{
		key: 'art',
		label: 'Art'
	},
	{
		key: 'alife',
		label: 'Artificial Life'
	},
	{
		key: 'educational',
		label: 'Educational'
	},
	{
		key: 'game',
		label: 'Game'
	},
	{
		key: 'research',
		label: 'Research'
	},
	{
		key: 'tool',
		label: 'Tools'
	},
	{
		key: 'webgl',
		label: 'WebGL'
	},
	{
		key: 'webgpu',
		label: 'WebGPU'
	}
];
export const projects: Project[] = [
	{
		title: 'Tissue',
		href: 'https://neovand.github.io/tissue/',
		repo: 'https://github.com/NeoVand/tissue',
		desc: 'An interpretability lab: train a transformer in your browser, then probe its neurons.',
		tags: ['ai', 'research', 'webgpu'],
		accent: '#22c55e',
		ground: 'linear-gradient(135deg,#1b2022,#101415)',
		img: '/media/tissue.jpg',
		video: null
	},
	{
		title: 'Pattern',
		href: 'https://neovand.github.io/pattern/',
		repo: 'https://github.com/NeoVand/pattern',
		desc: 'Machine learning for absolute beginners, from fitting a line to running an agent.',
		tags: ['educational', 'ai', 'webgpu'],
		accent: '#a78bfa',
		ground: 'linear-gradient(135deg,#1b1f20,#141619)',
		img: '/media/pattern.jpg',
		video: null
	},
	{
		title: 'Before the Move',
		href: 'https://neovand.github.io/LearningWorldModels/',
		repo: 'https://github.com/NeoVand/LearningWorldModels',
		desc: 'World models from first principles — train one in the page, or ask the book aloud.',
		tags: ['educational', 'ai', 'webgpu'],
		accent: '#38bdf8',
		ground: 'linear-gradient(135deg,#1a1d1f,#141619)',
		img: '/media/before-the-move.jpg',
		video: null
	},
	{
		title: 'harnessXray',
		href: 'https://neovand.github.io/harnessXray/',
		repo: 'https://github.com/NeoVand/harnessXray',
		desc: 'See how an AI agent really works: prompts, tools, memory, and token cost.',
		tags: ['educational', 'ai', 'research'],
		accent: '#6366f1',
		ground: 'linear-gradient(135deg,#0a0a1e,#060614)',
		img: '/media/harnessxray.jpg',
		video: null
	},
	{
		title: 'Voicebook',
		href: 'https://neovand.github.io/voicebook/',
		repo: 'https://github.com/NeoVand/voicebook',
		desc: 'Talk with your documents: AI-controlled scrolling and highlighting, local inference, and optional cloud models.',
		tags: ['ai', 'webgpu', 'tool'],
		accent: '#38bdf8',
		ground: 'linear-gradient(135deg,#04121c,#020c14)',
		img: '/media/voicebook.jpg',
		video: null
	},
	{
		title: 'LangX',
		href: 'https://langx.lol/',
		repo: 'https://github.com/NeoVand/LangX',
		desc: 'An interactive AI engineering course: 29 lessons on the LangChain stack.',
		tags: ['educational', 'ai'],
		accent: '#a855f7',
		ground: 'linear-gradient(135deg,#150828,#0d0520)',
		img: '/media/langx.jpg',
		video: '/media/langx.mp4'
	},
	{
		title: 'jaxverse',
		href: 'https://neovand.github.io/jaxverse/',
		repo: 'https://github.com/NeoVand/jaxverse',
		desc: 'An interactive book on deep learning where every model trains live on your own GPU.',
		tags: ['educational', 'ai', 'webgpu'],
		accent: '#38bdf8',
		ground: 'linear-gradient(135deg,#04121c,#020c14)',
		img: '/media/jaxverse.jpg',
		video: '/media/jaxverse.mp4'
	},
	{
		title: 'Embedding Playground',
		href: 'https://neovand.github.io/EmbeddingPlayground/',
		repo: 'https://github.com/NeoVand/EmbeddingPlayground',
		desc: 'Five labs for text-embedding models: compare, trace, search, classify, cluster.',
		tags: ['educational', 'ai', 'webgpu'],
		accent: '#38bdf8',
		ground: 'linear-gradient(135deg,#04121c,#020c14)',
		img: '/media/embedding-playground.jpg',
		video: '/media/embedding-playground.mp4'
	},
	{
		title: 'gradientlab.ai',
		href: 'https://gradientlab.ai',
		repo: 'https://github.com/NeoVand/GradientDescent',
		desc: 'Watch optimizers navigate loss landscapes in real time, with D3-powered animations.',
		tags: ['educational', 'ai', 'research'],
		accent: '#a855f7',
		ground: 'linear-gradient(135deg,#180828,#0f0520)',
		img: '/media/gradientlab.jpg',
		video: null
	},
	{
		title: 'VLMOCR',
		href: 'https://neovand.github.io/VLMOCR/',
		repo: 'https://github.com/NeoVand/VLMOCR',
		desc: 'Multi-region image-to-text with vision language models. Prompt and stream.',
		tags: ['ai', 'research'],
		accent: '#e89c3e',
		ground: 'linear-gradient(135deg,#1a1206,#120d04)',
		img: '/media/vlmocr.jpg',
		video: null
	},
	{
		title: 'jax-js skill',
		href: 'https://github.com/NeoVand/jax-js-skill',
		repo: 'https://github.com/NeoVand/jax-js-skill',
		desc: 'An agent skill for training real neural networks in the browser with jax-js.',
		tags: ['ai', 'webgpu'],
		accent: '#38bdf8',
		ground: 'linear-gradient(135deg,#04121c,#020c14)',
		img: '/media/jax-js-skill.jpg',
		video: null
	},
	{
		title: 'General Relativity',
		href: 'https://neovand.github.io/general-relativity/',
		repo: 'https://github.com/NeoVand/general-relativity',
		desc: 'From a cart and a clock to curved spacetime — change the experiment, or ask the page aloud.',
		tags: ['educational', 'ai', 'webgl'],
		accent: '#a78bfa',
		ground: 'linear-gradient(135deg,#141a2a,#090c16)',
		img: '/media/general-relativity.jpg',
		video: '/media/general-relativity.mp4'
	},
	{
		title: 'MIDI Lab',
		href: 'https://neovand.github.io/midilab/',
		repo: 'https://github.com/NeoVand/midilab',
		desc: 'Thirty-one lessons wired to a live MIDI engine — press a key and the bytes appear, decoded.',
		tags: ['educational', 'tool'],
		accent: '#22c55e',
		ground: 'linear-gradient(135deg,#08160a,#050e07)',
		img: '/media/midilab.jpg',
		video: '/media/midilab.mp4'
	},
	{
		title: 'TerminalVibes',
		href: 'https://neovand.github.io/terminalvibes/',
		repo: 'https://github.com/NeoVand/terminalvibes',
		desc: 'A visual guide to the shell for the AI era. Read, verify, and run in a browser playground.',
		tags: ['educational'],
		accent: '#22c55e',
		ground: 'linear-gradient(135deg,#08160a,#050e07)',
		img: '/media/terminalvibes.jpg',
		video: null
	},
	{
		title: 'Protocol Lab',
		href: 'https://neovand.github.io/coms/',
		repo: 'https://github.com/NeoVand/coms',
		desc: 'An interactive atlas of 46 network protocols, from TCP to QUIC.',
		tags: ['educational'],
		accent: '#e89c3e',
		ground: 'linear-gradient(135deg,#1c1006,#130b04)',
		img: '/media/protocol-lab.jpg',
		video: null
	},
	{
		title: 'GitVibes',
		href: 'https://neovand.github.io/gitvibes/',
		repo: 'https://github.com/NeoVand/gitvibes',
		desc: 'A visual, interactive guide to Git for AI-assisted coders, minus the jargon.',
		tags: ['educational'],
		accent: '#e89c3e',
		ground: 'linear-gradient(135deg,#1a1004,#110c03)',
		img: '/media/gitvibes.jpg',
		video: null
	},
	{
		title: 'SoftMax Explainer',
		href: 'https://neovand.github.io/SoftMaxExplainer/',
		repo: 'https://github.com/NeoVand/SoftMaxExplainer',
		desc: 'The softmax function made interactive: temperature, logits, probability.',
		tags: ['educational'],
		accent: '#a855f7',
		ground: 'linear-gradient(135deg,#120828,#0c0620)',
		img: '/media/softmax.jpg',
		video: null
	},
	{
		title: 'Neocalculus',
		href: 'https://neovand.github.io/neocalculus/',
		repo: 'https://github.com/NeoVand/neocalculus',
		desc: 'An infinitesimal-first calculus book. Learn by manipulation, not memory.',
		tags: ['educational'],
		accent: '#a855f7',
		ground: 'linear-gradient(135deg,#0e0622,#080418)',
		img: '/media/neocalculus.jpg',
		video: null
	},
	{
		title: 'RDB',
		href: 'https://neovand.github.io/RDB/',
		repo: 'https://github.com/NeoVand/RDB',
		desc: 'Relational databases from first principles — with live SQL playgrounds in every section.',
		tags: ['educational'],
		accent: '#e89c3e',
		ground: 'linear-gradient(135deg,#1a1206,#120d04)',
		img: '/media/rdb.jpg',
		video: null
	},
	{
		title: 'UI Atlas',
		href: 'https://neovand.github.io/ui-component-guide/',
		repo: 'https://github.com/NeoVand/ui-component-guide',
		desc: 'A component reference for vibe coders: browse, compare, copy in one place.',
		tags: ['educational'],
		accent: '#e89c3e',
		ground: 'linear-gradient(135deg,#18130a,#100e06)',
		img: '/media/ui-atlas.jpg',
		video: null
	},
	{
		title: 'Swarm',
		href: 'https://neovand.github.io/swarm/',
		repo: 'https://github.com/NeoVand/swarm',
		desc: 'Thousands of agents forming emergent flocks, GPU-accelerated in your browser.',
		tags: ['research', 'art', 'alife', 'webgpu'],
		accent: '#6366f1',
		ground: 'linear-gradient(135deg,#0b1130,#07091e)',
		img: '/media/swarm.jpg',
		video: '/media/swarm.mp4'
	},
	{
		title: 'Moiré',
		href: 'https://neovand.github.io/Moire/',
		repo: 'https://github.com/NeoVand/moire',
		desc: 'A WebGPU studio for interference fields, where every layer is a scalar field rather than a drawing.',
		tags: ['art', 'webgpu'],
		accent: '#e5e7eb',
		ground: 'linear-gradient(135deg,#0b0b0b,#050505)',
		img: '/media/moire.jpg',
		video: '/media/moire.mp4'
	},
	{
		title: 'Games of Life',
		href: 'https://neovand.github.io/games-of-life/',
		repo: 'https://github.com/NeoVand/games-of-life',
		desc: 'WebGPU-powered cellular automaton engine with a live rule editor, presets, and brush tools.',
		tags: ['art', 'alife', 'webgpu'],
		accent: '#22c55e',
		ground: 'linear-gradient(135deg,#061408,#040e06)',
		img: '/media/games-of-life.jpg',
		video: null
	},
	{
		title: 'Algocell',
		href: 'https://neovand.github.io/algocell/',
		repo: 'https://github.com/NeoVand/algocell',
		desc: 'Artificial life emerging from Z80 machine code bytes — evolution in your browser.',
		tags: ['alife', 'webgpu'],
		accent: '#22c55e',
		ground: 'linear-gradient(135deg,#041808,#030f06)',
		img: '/media/algocell.jpg',
		video: null
	},
	{
		title: 'Zilion',
		href: 'https://github.com/NeoVand/zilion',
		repo: 'https://github.com/NeoVand/zilion',
		desc: 'Thousands of Z80 CPUs in a single WebGPU dispatch, an emulator built for artificial life.',
		tags: ['webgpu'],
		accent: '#22c55e',
		ground: 'linear-gradient(135deg,#041808,#030f06)',
		img: '/media/zilion.jpg',
		video: null
	},
	{
		title: 'Boids',
		href: 'https://neovand.github.io/boids/',
		repo: 'https://github.com/NeoVand/boids',
		desc: "Craig Reynolds' flocking algorithm in WebGL, every rule a live control.",
		tags: ['art', 'alife', 'webgl'],
		accent: '#a855f7',
		ground: 'linear-gradient(135deg,#140820,#0d0618)',
		img: '/media/boids.jpg',
		video: null
	},
	{
		title: 'Vibe Coding',
		href: 'https://neovand.github.io/vibe-coding/',
		repo: 'https://github.com/NeoVand/vibe-coding',
		desc: 'A first-person flight through volumetric clouds and ocean waves, raymarched in real time.',
		tags: ['art', 'webgpu', 'webgl'],
		accent: '#6366f1',
		ground: 'linear-gradient(135deg,#0a0a1e,#060614)',
		img: '/media/vibe-coding.jpg',
		video: '/media/vibe-coding.mp4'
	},
	{
		title: 'Moiré Fields',
		href: 'https://neovand.github.io/Moire/paper/',
		repo: 'https://github.com/NeoVand/Moire/tree/main/paper',
		desc: 'The theory behind Moiré: interference as a scalar field, and where the fringes fall.',
		tags: ['research', 'art'],
		accent: '#e5e7eb',
		ground: 'linear-gradient(135deg,#f5f4f0,#e6e5e0)',
		img: '/media/moire-fields.jpg',
		video: null
	},
	{
		title: 'Goldbach',
		href: 'https://neovand.github.io/Goldbach/',
		repo: 'https://github.com/NeoVand/goldbach',
		desc: 'One FFT counts every Goldbach partition — and the Riemann zeros turn up in the residue.',
		tags: ['research'],
		accent: '#6366f1',
		ground: 'linear-gradient(135deg,#f4f4f5,#e4e4e7)',
		img: '/media/goldbach.jpg',
		video: null
	},
	{
		title: 'MacMac',
		href: 'https://macmac.lol/',
		repo: 'https://github.com/NeoVand/MacMac',
		desc: 'A game about sampling probability distributions with the fewest clicks.',
		tags: ['game', 'research'],
		accent: '#a855f7',
		ground: 'linear-gradient(135deg,#140820,#0d0618)',
		img: '/media/macmac.jpg',
		video: null
	},
	{
		title: 'Vid2GIF',
		href: 'https://github.com/NeoVand/Vid2GIF',
		repo: 'https://github.com/NeoVand/Vid2GIF',
		desc: 'A native macOS video-to-GIF converter that previews the real encoded output as you tune it.',
		tags: ['tool'],
		accent: '#38bdf8',
		ground: 'linear-gradient(135deg,#04121c,#020c14)',
		img: '/media/vid2gif.jpg',
		video: null
	},
	{
		title: 'TalkOver',
		href: 'https://chromewebstore.google.com/detail/talkover/jhkcpmamhcpjefjclddbpjoccgbjladl',
		repo: 'https://github.com/NeoVand/TalkOver',
		desc: 'Record a browser tab with mic and webcam overlay, then export to video or GIF. All local.',
		tags: ['tool'],
		accent: '#6366f1',
		ground: 'linear-gradient(135deg,#0a0a1e,#060614)',
		img: '/media/talkover.jpg',
		video: null
	}
];
export const papers: Paper[] = [
	{
		slug: 'bone-conduction',
		title:
			'Soft Speech, Loud World: Bone Conduction Microphones Enhance Voice Assistant Interaction',
		venue: 'IEEE International Conference on Consumer Electronics · 2024 · Principal investigator',
		pdf: '/papers/bone-conduction.pdf',
		pages: 5,
		authors:
			'Chanel Manzanillo, Ralfy Chettiar, Rahil Soroushmojdehi, Leou Ying, Juewei Dong, Mostafa ‘Neo’ Mohsenvand',
		abstract:
			'As the utilization of voice assistants becomes more widespread in daily activities, the demand for an interface capable of accurately recognizing speech at low volume levels within noisy environments is becoming increasingly important. In this study, we developed a custom device that incorporates a bone conduction microphone (BCM) by integrating a piezoelectric transducer with a noise-isolating impedance matching layer, alongside a MEMS air conduction microphone (ACM). Our study aims to assess the BCM’s effectiveness in facilitating soft speech communication with voice assistants in diverse noise environments and to validate its advantage over the ACM in noise reduction. We conducted experiments with participants using both the ACM and BCM to record audio samples for normal speech, soft speech, and whisper in three different noise level environments: ambient (quiet office setting), music, and loud noise. Spectrogram and signal-to-noise ratio (SNR) analysis assessed each audio file’s signal quality, and an automatic speech recognition model estimated word error rate (WER) as a benchmark. In all tested scenarios, the BCM consistently demonstrated a significantly higher SNR than the ACM. While the ACM’s WER scores in the ambient environment were lower in all speech modes, the BCM outperformed the ACM in noisy conditions. Our findings confirm the custom BCM’s ability to reduce background noise without requiring pre-processing or complex hardware while effectively capturing soft speech, emphasizing the potential benefits of integrating BCMs into interfaces designed for communication with voice assistants.'
	},
	{
		slug: 'breathing',
		title:
			'Generating Breathing Patterns in Real-Time: Low-Latency Respiratory Phase Tracking from 25 Hz PPG',
		venue: 'HealthyIoT / HealthWear, Springer LNICST · 2024 · Principal investigator',
		pdf: '/papers/breathing.pdf',
		pages: 20,
		authors: 'Ian Karman, Yue Sun, Rahil Soroushmojdehi, Jose A. Silva, Mostafa ‘Neo’ Mohsenvand',
		abstract:
			'This study presents a low-latency, real-time breathing cycle tracking system utilizing a conditional Generative Adversarial Network (GAN) with Wasserstein loss, with a low-powered, low sample rate photoplethysmography (PPG) sensor. The aim is to provide a clinically accurate respiratory tool capable of tracking and visualizing the breathing cycle and rate in real time for at-home and general ambulatory applications. To detect breathing activity in real time, we used a wearable headband with a 25 Hz PPG sensor and an inductive respiratory sensor as ground truth, processing the inputs in one-second windows to meet the latency constraints. Signal processing and machine learning techniques were explored, and the proposed GAN-based method with Wasserstein loss and gradient penalty outperformed the others in accurately tracking the ground-truth breathing curve. Leveraging the GAN-generated breathing curve, a peak-detection algorithm calculated the respiratory rate with an average mean absolute error of 1.47 breaths per minute across ten test subjects — comparable to the high-sampling-rate PPG literature (1 bpm), but five times faster in real-time monitoring. The GAN-generated respiratory signal from a low-sampling-rate wearable PPG sensor demonstrates potential as a viable alternative to traditional respiratory monitoring, useful in applications such as pain management.'
	},
	{
		slug: 'seqclr',
		title: 'Contrastive Representation Learning for Electroencephalogram Classification',
		venue: 'NeurIPS ML4H Workshop, PMLR · 2020',
		pdf: '/papers/seqclr.pdf',
		pages: 16,
		authors: 'Mostafa ‘Neo’ Mohsenvand, Mohammad Rasool Izadi, Pattie Maes',
		abstract:
			'Interpreting and labeling human electroencephalogram (EEG) is a challenging task requiring years of medical training. We present a framework for learning representations from EEG signals via contrastive learning. By recombining channels from multi-channel recordings, we increase the number of samples quadratically per recording. We train a channel-wise feature extractor by extending the SimCLR framework to time-series data. We introduce a set of augmentations for EEG and study their efficacy on different classification tasks. We demonstrate that the learned features improve EEG classification and significantly reduce the amount of labeled data needed on three separate tasks: emotion recognition (SEED), normal/abnormal EEG classification (TUH), and sleep-stage scoring (SleepEDF). Our models show improved performance over previously reported supervised models on SEED and SleepEDF and self-supervised models on all three tasks.'
	},
	{
		slug: 'optical-flow',
		title:
			'Optical-flow analysis toolbox for characterization of spatiotemporal dynamics in mesoscale optical imaging of brain activity',
		venue: 'NeuroImage · 2017',
		pdf: '/papers/optical-flow.pdf',
		pages: 17,
		authors: 'Navvab Afrashteh, Samsoon Inayat, Mostafa Mohsenvand, Majid H. Mohajerani',
		abstract:
			'Wide-field optical imaging techniques constitute powerful tools to investigate mesoscale neuronal activity. The sampled data is a sequence of image frames in which one can investigate the flow of brain activity starting and terminating at source and sink locations. Approaches to the analysis of information flow include qualitative assessment to identify sources and sinks of activity as well as their trajectories, and quantitative measurements based on the temporal variation of pixel intensity; a few studies have estimated wave motion using optical-flow techniques from computer vision, but a comprehensive toolbox for the quantitative analysis of mesoscale brain activity data has been lacking. We present a graphical-user-interface toolbox in Matlab for investigating the spatiotemporal dynamics of mesoscale brain activity using optical-flow analyses. It implements three optical-flow methods — Horn–Schunck, Combined Local-Global, and Temporospatial — for estimating velocity vector fields of the flow of activity, from which we determine the locations of sources and sinks as well as the trajectories and velocities of flow. Using simulated data as well as sensory-evoked voltage and calcium imaging data from mice, we compared the efficacy of the three methods; the combined local-global method yields the best estimates of wave motion. The automated approach permits rapid and effective quantification of mesoscale brain dynamics and may facilitate the study of brain function in response to new experiences or pathology.'
	},
	{
		slug: 'rumor-gauge',
		title: 'Rumor Gauge: Predicting the Veracity of Rumors on Twitter',
		venue: 'ACM Transactions on Knowledge Discovery from Data · 2017',
		pdf: '/papers/rumor-gauge.pdf',
		pages: 36,
		authors: 'Soroush Vosoughi, Mostafa ‘Neo’ Mohsenvand, Deb Roy',
		abstract:
			'The spread of malicious or accidental misinformation in social media, especially in time-sensitive situations such as real-world emergencies, can have harmful effects on individuals and society. In this work, we developed models for automated verification of rumors — unverified information — that propagate through Twitter. To predict the veracity of rumors, we identified salient features of rumors by examining three aspects of information spread: the linguistic style used to express rumors, the characteristics of the people involved in propagating information, and network propagation dynamics. The predicted veracity of a time series of these features extracted from a rumor (a collection of tweets) is generated using Hidden Markov Models. The verification algorithm was trained and tested on 209 rumors representing 938,806 tweets collected from real-world events, including the 2013 Boston Marathon bombings, the 2014 Ferguson unrest and the 2014 Ebola epidemic, and many other rumors reported on popular websites that document public rumors. The algorithm correctly predicted the veracity of 75% of the rumors faster than any other public source, including journalists and law enforcement officials. The ability to track rumors and predict their outcomes may have practical applications for news consumers, financial markets, journalists and emergency services, and more generally may help minimize the impact of false information on Twitter.'
	},
	{
		slug: 'motifs',
		title:
			'Spontaneous cortical activity alternates between motifs defined by regional axonal projections',
		venue: 'Nature Neuroscience · 2013',
		pdf: '/papers/motifs.pdf',
		pages: 13,
		authors:
			'Majid H. Mohajerani, Allen W. Chan, Mostafa Mohsenvand, Jeffrey LeDue, Rui Liu, David A. McVea, Jamie D. Boyd, Yu Tian Wang, Mark Reimers, Timothy H. Murphy',
		abstract:
			'Using millisecond-timescale voltage-sensitive dye imaging in lightly anesthetized or awake adult mice, we show that a palette of sensory-evoked and hemisphere-wide activity motifs are represented in spontaneous activity. These motifs can reflect multiple modes of sensory processing, including vision, audition and touch. We found similar cortical networks with direct cortical activation using channelrhodopsin-2. Regional analysis of activity spread indicated modality-specific sources, such as primary sensory areas, a common posterior-medial cortical sink where sensory activity was extinguished within the parietal association area, and a secondary anterior medial sink within the cingulate and secondary motor cortices for visual stimuli. Correlation analysis between functional circuits and intracortical axonal projections indicated a common framework corresponding to long-range monosynaptic connections between cortical regions. Maps of intracortical monosynaptic structural connections predicted hemisphere-wide patterns of spontaneous and sensory-evoked depolarization. We suggest that an intracortical monosynaptic connectome shapes the ebb and flow of spontaneous cortical activity.'
	}
];
export const media: MediaItem[] = [
	{
		href: 'https://www.technologyreview.com/2018/07/17/141437/this-mans-quest-to-understand-memory-starts-with-obsessive-bodycam-recording-and-brain-wave/',
		title:
			'This man’s quest to understand memory starts with obsessive bodycam recording and brain-wave tracking',
		short: 'A quest to understand memory',
		source: 'MIT Tech Review · 2018',
		img: '/media/press/mit-tech-review.jpg',
		video: false
	},
	{
		href: 'https://singularityhub.com/2018/12/09/are-we-made-of-memories-a-researchers-quest-to-record-his-life/',
		title: 'Are We Made of Memories? A Researcher’s Quest to Record His Life',
		short: 'Are we made of memories?',
		source: 'Singularity Hub · 2018',
		img: '/media/press/singularity-hub.jpg',
		video: false
	},
	{
		href: 'https://www.fastcompany.com/3066210/in-this-immersive-dataverse-you-can-explore-big-data-using-your-senses',
		title: 'In This Immersive ‘DataVRse,’ You Can Explore Big Data Using Your Senses',
		short: 'Exploring data through the senses',
		source: 'Fast Company · 2016',
		img: '/media/press/fast-company.jpg',
		video: false
	},
	{
		href: 'https://www.media.mit.edu/people/mmv/overview/',
		title: 'Profile & research',
		short: 'Profile & research',
		source: 'MIT Media Lab',
		img: '/media/press/mit-media-lab.jpg',
		video: false
	},
	{
		href: 'https://www.youtube.com/watch?v=NpmzZkep5KI',
		title: 'Neuroscience for dummies 1: What are brains and Neurons?!',
		short: 'Neuroscience for dummies 1',
		source: 'YouTube',
		img: '/media/press/NpmzZkep5KI.jpg',
		video: true
	},
	{
		href: 'https://www.youtube.com/watch?v=Ms6rhONShAU',
		title: 'Neuroscience for dummies 2: A tour of the brain!',
		short: 'Neuroscience for dummies 2',
		source: 'YouTube',
		img: '/media/press/Ms6rhONShAU.jpg',
		video: true
	},
	{
		href: 'https://www.youtube.com/watch?v=2qr0mg4VQHs',
		title:
			'Generating Breathing Patterns In Real-Time: Low-Latency Respiratory Phase Tracking From 25Hz PPG',
		short: 'Generating Breathing Patterns',
		source: 'YouTube',
		img: '/media/press/2qr0mg4VQHs.jpg',
		video: true
	},
	{
		href: 'https://www.youtube.com/watch?v=hiZTIHOSmFQ',
		title: 'SkipNorm',
		short: 'SkipNorm',
		source: 'YouTube',
		img: '/media/press/hiZTIHOSmFQ.jpg',
		video: true
	},
	{
		href: 'https://www.youtube.com/watch?v=mgtM69BTkZE',
		title: 'SeqCLR',
		short: 'SeqCLR',
		source: 'YouTube',
		img: '/media/press/mgtM69BTkZE.jpg',
		video: true
	},
	{
		href: 'https://www.youtube.com/watch?v=Tg7A77ls2Fk',
		title: 'JMAP — Journalism Network Analysis',
		short: 'JMAP',
		source: 'YouTube',
		img: '/media/press/Tg7A77ls2Fk.jpg',
		video: true
	},
	{
		href: 'https://www.youtube.com/watch?v=-qt5I43gmBU',
		title: 'Rhizome',
		short: 'Rhizome',
		source: 'YouTube',
		img: '/media/press/-qt5I43gmBU.jpg',
		video: true
	},
	{
		href: 'https://www.youtube.com/watch?v=7EcNLl4ujz0',
		title: 'FoodNet',
		short: 'FoodNet',
		source: 'YouTube',
		img: '/media/press/7EcNLl4ujz0.jpg',
		video: true
	},
	{
		href: 'https://www.youtube.com/watch?v=stm4VBpm3Do',
		title: 'DataVRse Network Viewer — Elections',
		short: 'DataVRse',
		source: 'YouTube',
		img: '/media/press/stm4VBpm3Do.jpg',
		video: true
	},
	{
		href: 'https://www.youtube.com/watch?v=IAKn-_H9NkE',
		title: 'Tragedy in CUDA',
		short: 'Tragedy in CUDA',
		source: 'YouTube',
		img: '/media/press/IAKn-_H9NkE.jpg',
		video: true
	},
	{
		href: 'https://www.youtube.com/watch?v=uTVis8SGdk4',
		title: 'Neural Field Simulator — Pattern Formation',
		short: 'Neural Field Simulator',
		source: 'YouTube',
		img: '/media/press/uTVis8SGdk4.jpg',
		video: true
	}
];
export const earlier: Earlier[] = [
	{
		title: 'inSight: Deep Neurofeedback',
		desc: 'Brain decoding using BigGAN and MusicVAE to generate naturalistic neurofeedback stimuli.',
		img: '/media/mit/dnf-01-ihlgqlt.jpg',
		grey: false,
		href: 'https://www.media.mit.edu/projects/insight-deep-neurofeedback/overview/'
	},
	{
		title: 'Affective Memory Summarization',
		desc: 'Using affective signals to condense 16 hours of body-cam footage into a 15-minute daily recap.',
		img: '/media/mit/affective.jpg',
		grey: false,
		href: 'https://www.media.mit.edu/projects/affective-memory-summarization/overview/'
	},
	{
		title: 'Large-Scale EEG Biometrics',
		desc: 'Self-supervised EEG-based user identification at scale, surpassing prior 157-subject limits.',
		img: '/media/mit/fig-topo-01.jpg',
		grey: false,
		href: 'https://www.media.mit.edu/projects/large-scale-eeg-biometrics-through-self-supervised-learning/overview/'
	},
	{
		title: 'Physiophone',
		desc: 'Sonification of electrophysiological signals — turning EEG, ECG, and EMG into sound.',
		img: '/media/mit/perspective-copy.jpg',
		grey: true,
		href: 'https://www.media.mit.edu/projects/physiophone/overview/'
	},
	{
		title: 'Flower: EEG Visualization',
		desc: 'Open-source tool for in-depth visual analysis of multi-channel time-domain neural recordings.',
		img: '/media/mit/flower-01.jpg',
		grey: false,
		href: 'https://www.media.mit.edu/projects/flower-eeg-visualization-with-the-aid-of-machine-learning/overview/'
	},
	{
		title: 'SkipNorm',
		desc: 'A flexible deep learning building block that combines skip connections and normalization in one layer.',
		img: '/media/mit/skipnorm.jpg',
		grey: false,
		href: 'https://www.media.mit.edu/projects/skipnorm/overview/'
	},
	{
		title: 'Q: Conversational Data Labeling',
		desc: 'An intelligent interface that builds a personal knowledge graph through natural conversation.',
		img: '/media/mit/qpipe-sfgqfow.jpg',
		grey: false,
		href: 'https://www.media.mit.edu/projects/q-ai-that-makes-the-graph-of-your-memories/overview/'
	},
	{
		title: 'DataVRse',
		desc: 'VR visualization of the Twitter social graph during the 2016 U.S. Presidential Election.',
		img: '/media/mit/electome.jpg',
		grey: false,
		href: 'https://www.media.mit.edu/projects/datavrse/overview/'
	},
	{
		title: 'Rhizome',
		desc: 'A tool for navigating personal memories to support people living with dementia.',
		img: '/media/mit/laura-fuhrman-73ojlcahqhg-un.jpg',
		grey: false,
		href: 'https://www.media.mit.edu/projects/rhizome/overview/'
	},
	{
		title: 'The Electome',
		desc: 'AI-driven mapping of the 2016 election public sphere — where machine intelligence meets political journalism.',
		img: '/media/mit/image-2.jpg',
		grey: false,
		href: 'https://www.media.mit.edu/projects/the-electome-measuring-responsiveness-in-the-2016-election/overview/'
	},
	{
		title: 'SeqCLR: Self-Supervised Features',
		desc: 'Contrastive learning of representations for EEG and other time-series data, without labels.',
		img: '/media/mit-seqclr.jpg',
		grey: false,
		href: 'https://www.media.mit.edu/projects/seqclr-self-supervised-learning-of-features-for-time-series-data/overview/'
	},
	{
		title: 'VR Maze in Zero Gravity',
		desc: 'Testing how spatial memory holds up on a parabolic flight, once the sense of up is gone.',
		img: '/media/mit-vrmaze.jpg',
		grey: false,
		href: 'https://www.media.mit.edu/projects/vr-maze-in-zero-gravity/overview/'
	},
	{
		title: 'The Foodome',
		desc: 'A knowledge graph of food, linking how we talk and learn about it to what it actually contains.',
		img: '/media/mit-foodome.jpg',
		grey: false,
		href: 'https://www.media.mit.edu/projects/the-foodome-building-a-comprehensive-knowledge-graph-of-food/overview/'
	},
	{
		title: 'The Electome (Talk)',
		desc: 'A talk on the Electome from the Laboratory for Social Machines, built with Twitter and Knight Foundation.',
		img: '/media/mit-electome-talk.jpg',
		grey: false,
		href: 'https://www.media.mit.edu/videos/sm-electome-2017-01-31/'
	},
	{
		title: 'Sole2Soul',
		desc: 'An interface with the soul of a city. First place and the Bill Mitchell Design Award at Make Me++.',
		img: '/media/mit-sole2soul.jpg',
		grey: false,
		href: 'https://sole2soul.media.mit.edu/'
	},
	{
		title: 'Ontology Generation from Unstructured Data',
		desc: 'Inducing an ontology tree from a million social media posts so the set can be navigated by meaning.',
		img: '/media/legacy/thumbs/ontology.jpg',
		grey: false,
		key: 'ontology',
		detail: {
			title: 'Ontology Generation from Unstructured Data',
			year: 'MIT Media Lab, Laboratory for Social Machines',
			body: [
				'Half of a research proposal on exploring very large collections of social media posts. The idea is to treat the posts, their replies and their attributes as a network, recover its community structure recursively, and read the resulting hierarchy as an ontology tree.',
				'That tree becomes the navigation surface. You can move between levels of abstraction rather than scrolling a flat list, compare ongoing trends when there are far too many time series to plot at once, and search semantically instead of by keyword. Different ontologies over the same data simplify different kinds of search.',
				'The underlying graph is held in a Neo4j database so that other people in the lab can run their own queries against it.'
			],
			link: {
				label: 'Read the full proposal',
				href: 'https://1554bc9a-5d6c-42cc-a343-10a96a535ed0.filesusr.com/ugd/a45a4a_b34fd433ea7746c9809d9310b051f687.pdf'
			},
			images: [
				'/media/legacy/ontology-1.jpg',
				'/media/legacy/ontology-2.jpg',
				'/media/legacy/ontology-3.jpg'
			]
		}
	},
	{
		title: 'Fundamental Laws of Storytelling',
		desc: "Turning a walk through a dataset's ontology tree into readable narrative.",
		img: '/media/legacy/thumbs/storytelling.jpg',
		grey: false,
		key: 'storytelling',
		detail: {
			title: 'Fundamental Laws of Storytelling',
			year: 'MIT Media Lab, Laboratory for Social Machines',
			body: [
				'The companion half of the same proposal. Once a dataset has been folded into an ontology tree, a description of that dataset is just a traversal of the tree.',
				'Parent nodes hold information aggregated from their children, so walking the tree emits a continuous sequence of bullet points, which a natural language generation step then stitches into readable prose.',
				'Because the traversal is parameterized, the same data can be retold at different lengths, with different sentiment and different emphasis, by changing how you walk rather than by rewriting anything.'
			],
			link: {
				label: 'Read the full proposal',
				href: 'https://1554bc9a-5d6c-42cc-a343-10a96a535ed0.filesusr.com/ugd/a45a4a_b34fd433ea7746c9809d9310b051f687.pdf'
			},
			images: ['/media/legacy/storytelling-1.jpg']
		}
	},
	{
		title: 'Beauty and the Code',
		desc: "Testing Schmidhuber's compression progress theory of beauty on 300 human subjects.",
		img: '/media/legacy/thumbs/beauty.jpg',
		grey: false,
		key: 'beauty',
		detail: {
			title: 'Beauty and the Code',
			year: 'Computational aesthetics',
			body: [
				'An attempt to put a computational account of beauty and interestingness perception on empirical footing, starting from Jürgen Schmidhuber’s coherence progress (or compression progress) theory, which had mostly been used to drive exploration in intelligent agents.',
				'To make the theory testable, mathematical formulas were treated as the generative algorithms behind two-dimensional plots. Over 100 people first rated how complex they found a set of formulas, and those ratings were fitted with Bayesian and evolutionary models of formula complexity perception. The fitted models then generated plots spanning a wide range of perceived complexity.',
				'More than 200 further subjects rated those plots for interestingness, before and after being shown the formula that generated them. Two hypotheses held: interestingness rises once you see the formula behind a plot, and it rises further for a simple formula than for a complex one. Both agree with Schmidhuber’s framework, and the fitted relationship between the two suggests a refinement of it.'
			],
			link: {
				label: 'Read the full article',
				href: 'https://1554bc9a-5d6c-42cc-a343-10a96a535ed0.filesusr.com/ugd/a45a4a_03f77d5d6fca440e8e88b683e56d5673.pdf'
			},
			images: [
				'/media/legacy/beauty-1.jpg',
				'/media/legacy/beauty-2.jpg',
				'/media/legacy/beauty-3.jpg',
				'/media/legacy/beauty-4.jpg',
				'/media/legacy/beauty-5.jpg',
				'/media/legacy/beauty-6.jpg'
			]
		}
	},
	{
		title: 'From Neural Networks to Social Networks',
		desc: 'Social force as a rate-based neural network, and a way to see the Milgram gaze experiment.',
		img: '/media/legacy/thumbs/socialnets.jpg',
		grey: false,
		key: 'socialnets',
		detail: {
			title: 'From Neural Networks to Social Networks',
			year: 'Essay',
			body: [
				'An informal essay on modelling social force through a simple rate-based neural network, written partly as a critique of the social <em>F = ma</em> analogy and of where it stops being useful.',
				'It introduces a visualization of the Milgram crowd gaze experiment as a thinking tool, one that makes competition bias and attention inversion visible, and closes with a modified model that takes both into account.'
			],
			link: {
				label: 'Read the full essay',
				href: 'https://1554bc9a-5d6c-42cc-a343-10a96a535ed0.filesusr.com/ugd/a45a4a_ecc4dbbf7dd14dc5985b77b9d6b8cf95.pdf'
			},
			images: [
				'/media/legacy/socialnets-1.jpg',
				'/media/legacy/socialnets-2.jpg',
				'/media/legacy/socialnets-3.jpg'
			]
		}
	},
	{
		title: 'Allen Connectivity Atlas API',
		desc: 'A Python client for fetching, searching and visualizing mouse brain connectivity data.',
		img: '/media/legacy/thumbs/allenapi.jpg',
		grey: false,
		key: 'allenapi',
		detail: {
			title: 'Python API for the Allen Connectivity Atlas',
			year: 'Open-source tooling',
			body: [
				'A Python client for the <a href="http://connectivity.brain-map.org/" target="_blank" rel="noopener">Allen Connectivity Atlas</a>, so that fetching, searching and visualizing mouse brain connectivity data and the underlying section images takes a few lines rather than a pipeline.',
				'Beyond retrieval, it was designed to let the user run basic data mining and machine learning directly on the volumes it returns.'
			],
			link: null,
			images: [
				'/media/legacy/allenapi-1.jpg',
				'/media/legacy/allenapi-2.jpg',
				'/media/legacy/allenapi-3.jpg',
				'/media/legacy/allenapi-4.jpg'
			]
		}
	},
	{
		title: 'Script-Draw Language',
		desc: 'A REPL-driven language for creative coding, where a hand-drawn line arrives as a list of points.',
		img: '/media/legacy/thumbs/scriptdraw.jpg',
		grey: false,
		key: 'scriptdraw',
		detail: {
			title: 'Script-Draw Programming Language',
			year: 'Creative coding',
			body: [
				'A language for creative coding. Where Processing, OpenFrameworks and Cinder are compiled languages or APIs, Script-Draw is dynamically typed and driven from a REPL, so results can be evaluated interactively while you work.',
				'A short script sets up a drawing surface. You then draw a line by hand, and that line arrives in the scripting environment as a list of points. From there the coordinates and their ordering are yours to manipulate, and a single drawn stroke can be turned into a whole family of forms.',
				'The same pipeline drives audio and general analog signals, which means it can also control external devices.'
			],
			link: null,
			images: ['/media/legacy/scriptdraw-1.jpg', '/media/legacy/scriptdraw-2.jpg']
		}
	},
	{
		title: 'Beating and Network Time-Scales',
		desc: 'Beating between oscillators as the source of many time-scales, and of time perception.',
		img: '/media/legacy/thumbs/beating.jpg',
		grey: false,
		key: 'beating',
		detail: {
			title: 'Beating Hypothesis for Time-Scales in Complex Networks',
			year: 'Essay',
			body: [
				'Beating is a familiar phenomenon with some under-explored consequences. This report demonstrates how robust it stays under various kinds of noise and disturbance.',
				'The central claim is that beating can account for the coexistence of very different time-scales in a complex network, without anything in the network being tuned to those scales. It ends with a speculation about time perception in the brain, built on a simple beating clock.'
			],
			link: {
				label: 'Read the full essay',
				href: 'https://1554bc9a-5d6c-42cc-a343-10a96a535ed0.filesusr.com/ugd/a45a4a_990f5fe4add743feb44d6abf962f3b88.pdf'
			},
			images: ['/media/legacy/beating-1.jpg', '/media/legacy/beating-2.jpg']
		}
	},
	{
		title: 'Communicability in Complex Networks',
		desc: 'A new bound on communicability, a measure built on Beer-Lambert attenuation, applied to stroke.',
		img: '/media/legacy/thumbs/communicability.jpg',
		grey: false,
		key: 'communicability',
		detail: {
			title: 'Communicability in Complex Networks',
			year: 'Network theory',
			body: [
				'Starting from the standard properties of network communicability, this work proves a new bound relating it to the number of edges in the graph.',
				'It then defines an alternative measure grounded in physical networks and exponential signal attenuation, following the Beer-Lambert law. The new measure recovers the topology of the network slightly better than the usual one.',
				'Both measures are finally applied to brain connectivity data, before and eight weeks after stroke.'
			],
			link: {
				label: 'Read the full report',
				href: 'https://1554bc9a-5d6c-42cc-a343-10a96a535ed0.filesusr.com/ugd/a45a4a_89c6be3a4e784716a043854474833640.pdf'
			},
			images: [
				'/media/legacy/communicability-1.jpg',
				'/media/legacy/communicability-2.jpg',
				'/media/legacy/communicability-3.jpg'
			]
		}
	},
	{
		title: 'Grid Optogenetics',
		desc: 'Robotic laser stimulation on a grid, building an overcomplete dictionary of cortical responses.',
		img: '/media/legacy/thumbs/gridopto.jpg',
		grey: false,
		key: 'gridopto',
		detail: {
			title: 'Grid Optogenetics',
			year: 'MSc thesis',
			body: [
				'A method for acquiring an overcomplete dictionary of evoked cortical signals. The cortex of a ChR2 transgenic mouse is stimulated at a grid of equally spaced points, one at a time.',
				'The grid is generated automatically from the size and geometry of the craniotomy window and registered to the hind-limb primary sensory cortex, and a robotic system steers the laser beam between points. I designed the experiment and programmed the robot.'
			],
			link: null,
			images: ['/media/legacy/gridopto-1.jpg']
		}
	},
	{
		title: 'Calibrated Sensing for Video',
		desc: "Fitting the sensing matrix to the signal's energy distribution to escape the complexity/RIP trade-off.",
		img: '/media/legacy/thumbs/calibrated.jpg',
		grey: false,
		key: 'calibrated',
		detail: {
			title: 'Calibrated Sensing for Sparse Recovery of Video',
			year: 'Compressed sensing',
			body: [
				'Sparse recovery over shift-invariant unions of subspaces runs into a trade-off between computational complexity and the restricted isometry property of the sensing matrix.',
				'The strategy here is to calibrate the sensing matrix to the energy distribution along the signal. The matrix ends up much smaller, and its restricted isometry property improves rather than degrades. Results were in preparation for publication.'
			],
			link: null,
			images: [
				'/media/legacy/calibrated-1.jpg',
				'/media/legacy/calibrated-2.jpg',
				'/media/legacy/calibrated-3.jpg'
			]
		}
	},
	{
		title: 'Shift-Adaptive Sparse Recovery',
		desc: 'Tuning the shifts inside the sensing matrix by binary search for a large gain in accuracy.',
		img: '/media/legacy/thumbs/shiftadaptive.jpg',
		grey: false,
		key: 'shiftadaptive',
		detail: {
			title: 'Shift-Adaptive Sparse Recovery for Video',
			year: 'Compressed sensing',
			body: [
				'The more advanced form of the calibrated sensing work. Instead of fixing the shifts in the sensing matrix once, they are tuned iteratively by a simple binary search over the search intervals.',
				'This costs more computation per iteration but improves the accuracy of recovery substantially. Results were in preparation for publication.'
			],
			link: null,
			images: ['/media/legacy/shiftadaptive-1.jpg', '/media/legacy/shiftadaptive-2.jpg']
		}
	},
	{
		title: 'Brownian Bridge Vectorization',
		desc: 'Images redrawn as wandering paths, using segmentation and travelling salesman tours.',
		img: '/media/legacy/thumbs/brownian.jpg',
		grey: false,
		key: 'brownian',
		detail: {
			title: 'Brownian Bridge Vectorization',
			year: 'Generative art',
			body: [
				'These images are built from two-dimensional Brownian bridges, morphological segmentation of a source image, and approximate solutions to the travelling salesman problem, so that a photograph is redrawn as a single wandering path.',
				'The method is straightforward to implement in the Script-Draw language.'
			],
			link: null,
			images: [
				'/media/legacy/brownian-1.jpg',
				'/media/legacy/brownian-2.jpg',
				'/media/legacy/brownian-3.jpg',
				'/media/legacy/brownian-4.jpg'
			]
		}
	},
	{
		title: 'Optical Flow of Cortical Waves',
		desc: 'Measuring the velocity of cortical waves to locate sinks and sources. Published in Nature Neuroscience.',
		img: '/media/legacy/thumbs/opticalflow.jpg',
		grey: false,
		key: 'opticalflow',
		detail: {
			title: 'Optical Flow Analysis of VSD Signals',
			year: 'Published in Nature Neuroscience',
			body: [
				'Optical flow algorithms applied to voltage-sensitive dye imaging, to measure the velocity of waves travelling across the cortex. Analysing the resulting vector fields locates the cortical sinks and sources those waves run between.',
				'The work contributed to Mohajerani MH*, Chan AW*, Mohsenvand M, LeDue J, Liu R, McVea D, Boyd J, Reimer M, Wang YT, Murphy TH (2013), <em>Spontaneous cortical activity alternates between motifs defined by regional axonal projections</em>, Nature Neuroscience 16:1426–1435, which was selected for the journal cover.'
			],
			link: {
				label: 'Read the paper',
				href: 'http://www.nature.com/neuro/journal/v16/n10/abs/nn.3499.html'
			},
			images: [
				'/media/legacy/opticalflow-1.jpg',
				'/media/legacy/opticalflow-2.jpg',
				'/media/legacy/opticalflow-3.jpg'
			]
		}
	},
	{
		title: 'Rod Theory for Foldable Tents',
		desc: 'Modelling how a pop-up tent folds with the same theory used for DNA mechanics.',
		img: '/media/legacy/thumbs/rodtheory.jpg',
		grey: false,
		key: 'rodtheory',
		detail: {
			title: 'Rod Theory Applied to Foldable Tents',
			year: 'Applied mathematics',
			body: [
				'Rod theory describes how a thin elastic filament bends and twists. It has found recent use in the mechanics of DNA molecules and in computer graphics.',
				'Here it is applied to a pop-up tent, to model how the frame stores and releases energy as it is folded and sprung open.'
			],
			link: null,
			images: [
				'/media/legacy/rodtheory-1.jpg',
				'/media/legacy/rodtheory-2.jpg',
				'/media/legacy/rodtheory-3.jpg',
				'/media/legacy/rodtheory-4.jpg'
			]
		}
	},
	{
		title: 'Real-time Neural Field Simulator',
		desc: 'Integrating neural field equations fast enough to watch bumps, stripes and labyrinths form.',
		img: '/media/legacy/thumbs/neuralfield.jpg',
		grey: false,
		key: 'neuralfield',
		detail: {
			title: 'Real-time Neural Field Simulator',
			year: 'Simulation',
			body: [
				'A simulator for neural field models, integrating the governing integro-differential equations with a simple Eulerian scheme and running fast enough to explore parameter space by hand.',
				'Because the response is visible as you change the connectivity kernel, a whole range of pattern-formation regimes can be found by feel: bumps, spots, rings, stripes and labyrinths.'
			],
			link: null,
			images: [
				'/media/legacy/neuralfield-1.jpg',
				'/media/legacy/neuralfield-2.jpg',
				'/media/legacy/neuralfield-3.jpg',
				'/media/legacy/neuralfield-4.jpg',
				'/media/legacy/neuralfield-5.jpg'
			]
		}
	},
	{
		title: 'Satellite Attitude Control',
		desc: 'A Simulink attitude controller flown by joystick, with injected noise, rendered in VR.',
		img: '/media/legacy/thumbs/satellite.jpg',
		grey: false,
		key: 'satellite',
		detail: {
			title: 'Real-time Satellite Attitude Control System',
			year: 'Control engineering',
			body: [
				'A satellite attitude control system built in Simulink. Attitude is commanded live from a joystick while noise and distortion are injected into the loop, and the resulting motion is displayed as a virtual reality view of the spacecraft.'
			],
			link: null,
			images: ['/media/legacy/satellite-1.jpg', '/media/legacy/satellite-2.jpg']
		}
	},
	{
		title: 'Tumour Growth by Cellular Automata',
		desc: 'Local rules for tissue growth under varying conditions, shown here as a simulated tumour.',
		img: '/media/legacy/thumbs/tumor.jpg',
		grey: false,
		key: 'tumor',
		detail: {
			title: 'Tumour Growth Simulation using Cellular Automata',
			year: 'Simulation',
			body: [
				'A set of cellular automaton rules for simulating tissue growth under varying nutrient and crowding conditions. The figures show a tumour grown under those rules.'
			],
			link: null,
			images: ['/media/legacy/tumor-1.jpg', '/media/legacy/tumor-2.jpg']
		}
	},
	{
		title: 'Optogenetic Seizure Suppression',
		desc: 'A two-part viral vector that finds epileptic tissue, marks it, and makes it silenceable by light.',
		img: '/media/legacy/thumbs/seizure.jpg',
		grey: false,
		key: 'seizure',
		detail: {
			title: 'Seizure Suppression using Optogenetics',
			year: 'Proposal',
			body: [
				'A proposal for desynchronizing and inhibiting seizure activity in epileptic patients using optogenetics.',
				'The viral vector has two parts. Part T detects and marks the epileptic area by responding to seizure activity itself, and part S infects that marked area with NpHR so it can be silenced with light. The region also expresses a fluorescent protein, so a surgeon can see exactly which tissue was implicated.'
			],
			link: null,
			images: ['/media/legacy/seizure-1.jpg']
		}
	},
	{
		title: 'Compact Topology and Central Forces',
		desc: 'On a cylinder, a two-dimensional electrostatic force stops decaying to zero at long range.',
		img: '/media/legacy/thumbs/compacttopology.jpg',
		grey: false,
		key: 'compacttopology',
		detail: {
			title: 'Compact Topology Affects Central Forces',
			year: 'Theoretical physics',
			body: [
				'A short letter on central forces over manifolds with a compact dimension. For simplicity it works out a two-dimensional electrostatic-like interaction between two point charges embedded in a cylindrical space.',
				'The form of the interaction turns out to differ from the flat two-dimensional case. The striking result is that at long range the force does not fall to zero but tends to a constant set by the inverse radius of the cylinder, while for very large radii or very short distances it approaches the classical form.'
			],
			link: {
				label: 'Read the full report',
				href: 'https://1554bc9a-5d6c-42cc-a343-10a96a535ed0.filesusr.com/ugd/a45a4a_db8b164fee43403396dff884955e8b00.pdf'
			},
			images: [
				'/media/legacy/compacttopology-1.jpg',
				'/media/legacy/compacttopology-2.jpg',
				'/media/legacy/compacttopology-3.jpg'
			]
		}
	},
	{
		title: 'Unknotting Behaviour of Knots',
		desc: "A polynomial encoding of the graph left behind when a knot's crossings are switched.",
		img: '/media/legacy/thumbs/unknotting.jpg',
		grey: false,
		key: 'unknotting',
		detail: {
			title: 'Unknotting Behaviour of Knots',
			year: 'Knot theory',
			body: [
				'A combinatorial representation of the process by which a knot comes undone. Switching the crossings of a knot leaves behind a graph structure, and this work introduces a simple polynomial representation of that structure to describe the unknotting.'
			],
			link: null,
			images: ['/media/legacy/unknotting-1.jpg']
		}
	}
];
export const resume: Resume = {
	pdf: '/media/Neo-Mohsenvand-Resume.pdf?v=e3172e83115f',
	experience: [
		{
			id: 'cv-caterpillar',
			org: 'Caterpillar',
			when: 'Apr 2024 – present',
			roles: ['Chief AI Architect, Global Finance since January 2026'],
			body: '<h3 class="cv-position">Chief AI Architect, Global Finance<span class="cv-when">January 2026 – present · Irving, TX</span></h3> <ul class="cv-notes"> <li><strong>Tempo:</strong> Built an enterprise investigation platform and designed its meeting-like interview interface, combining stakeholder discovery, scheduling and OpenAI Realtime voice interviews with structured forms. Available to hundreds of internal users for idea intake, requirements gathering and conflict resolution.</li> <li><strong>Aperture:</strong> Built a new agentic image-generation harness for slide decks and visual assets, using terse prompts and hundreds of references to reduce reliance on third-party subscriptions.</li> <li><strong>Touchless Invoice Processing agent:</strong> Co-developed end-to-end orchestration from email ingestion and scanned-invoice OCR through exception handling and Snowflake writes, with a detailed multi-level evaluation framework. Reduced invoices needing human review from <strong>100% to 2%</strong>.</li> <li><strong>Teaching:</strong> Created 10+ workshop apps, including agentic RAG, talking dashboards and a voice-only data-science interface I designed. Teach engineers and senior leaders in the workshop\'s fifth iteration.</li> <li>Developing shared infrastructure for AI application prototyping and deployment across Global Finance.</li> </ul> <h3 class="cv-position">Senior Principal Data Scientist, Global Finance<span class="cv-when">May 2025 – January 2026 · Irving, TX</span></h3> <ul class="cv-notes"> <li><strong>Penman:</strong> Built and deployed an enterprise financial-analysis system using <strong>SvelteKit and Azure</strong> to analyze earnings-call transcripts and regulatory filings for finance leaders.</li> <li>Redesigned earnings-call transcript proofreading in Penman to help finance teams identify disclosure risks.</li> <li>Built <strong>MLflow / DeepEval</strong> evaluation infrastructure and coordinated organization-wide benchmark development.</li> <li>Built an AI-idea prioritization agent with RICE-derived scoring, internal impact metrics and human review.</li> <li>Designed adversarial LLM analysis of draft financial disclosures.</li> </ul> <h3 class="cv-position">Senior Engineering Fellow, Artificial Intelligence<span class="cv-when">April 2024 – May 2025 · Illinois</span></h3> <ul class="cv-notes"> <li>Founding technical hire of CAT Tech AI; led four engineers delivering <strong>12+ applications</strong> for <strong>8,000+ technical users</strong> through engineering-analysis automation.</li> <li>Created <strong>Magic Table</strong> for million-row spreadsheet/database workflows, combining formulas and iterative local-LLM prompts to reduce cloud compute costs; developed versions with Ollama.</li> <li>Built a <strong>ModernBERT-based embedding model</strong> for Caterpillar products and parts; orchestrated data collection, developed a synthetic training-pair generation app, and trained on an <strong>on-premises H200 cluster</strong>.</li> <li>Led distributed training, data curation, SFT/PEFT, PPO/DPO alignment, and automated and human evaluation.</li> <li>Established an AI curriculum and reading group across 10+ teams, training 300+ engineers.</li> </ul>'
		},
		{
			id: 'cv-brainco',
			org: 'BrainCo',
			when: 'Nov 2021 – Mar 2024',
			roles: ['Head of Research · Somerville, MA'],
			body: '<ul class="cv-notes"> <li>Led 11 researchers developing wearable AI and brain-computer interfaces; named inventor on five provisional patent applications.</li> <li>Led development of a conditional-GAN system reconstructing breathing patterns from 25 Hz wearable PPG. The <a href="/papers/breathing.pdf">published study</a> reports a one-second breathing-curve feedback delay and respiratory-rate mean absolute error of 1.47 breaths/min across ten test subjects.</li> <li>Led soft-speech interface research comparing contact and MEMS microphones. In an <a href="/papers/bone-conduction.pdf">eleven-person study</a>, contact microphones reduced soft-speech word error rate from 99–100% to 35% in the tested music/noise conditions.</li> </ul>'
		},
		{
			id: 'cv-mit-postdoc',
			org: 'MIT Media Lab',
			when: 'Nov 2021 – Jun 2022',
			roles: ['Postdoctoral Research Scientist, part-time · Cambridge, MA'],
			body: '<ul class="cv-notes"> <li>Researched multimodal memory systems and physiological data, building on doctoral work in continuous-capture memory interfaces and self-supervised EEG representations.</li> </ul>'
		},
		{
			id: 'cv-apple',
			org: 'Apple',
			when: 'Jun – Sep 2021',
			roles: ['Machine Learning Research Intern · Cupertino, CA'],
			body: '<ul class="cv-notes"> <li>Developed <strong>parameter-efficient transformers</strong> for biosignal event detection and continuous time-series processing.</li> <li>Built methods to inspect attention heads and activation patterns in continuous time-series models.</li> </ul>'
		},
		{
			id: 'cv-cortico',
			org: 'Cortico',
			when: 'Summer 2017',
			roles: ['Information Design & Data Visualization Intern · Cambridge, MA'],
			body: '<ul class="cv-notes"> <li>Built a browser-based WebGL visualization engine for dynamic social-network graphs.</li> </ul>'
		},
		{
			id: 'cv-ubc',
			org: 'University of British Columbia',
			when: 'Sep 2013 – Aug 2014',
			roles: ['Data Scientist and Researcher · Vancouver'],
			body: '<ul class="cv-notes"> <li>Developed a Python library for retrieving, composing, and visualizing Allen Brain Atlas connectivity data in 3D.</li> </ul>'
		}
	],
	education: [
		{
			id: 'cv-mit-phd',
			org: 'MIT',
			when: 'Completed 2021',
			roles: ['PhD, Media Arts and Sciences · Media Lab'],
			body: '<ul class="cv-notes"> <li>Completed in 2021; listed in MIT’s February 2022 degree record. Research in self-supervised learning and human–AI interaction.</li> <li>Thesis: <em>Classifying and Displaying Brain-Waves through Self-Supervised Learning.</em> Advisor: Pattie Maes. Co-advisors: Tomaso Poggio and Ed Boyden.</li> <li>First author of <a href="https://proceedings.mlr.press/v136/mohsenvand20a.html">SeqCLR</a> (ML4H NeurIPS Workshop, 2020), adapting contrastive learning to EEG through channel recombination and signal augmentations; evaluated emotion recognition, sleep staging, and abnormal-EEG detection across three datasets.</li> <li>Doctoral work also included continuous-capture memory interfaces and tools for human attention.</li> </ul>'
		},
		{
			id: 'cv-oxford',
			org: 'University of Oxford',
			when: '2013',
			roles: ['MSc, Mathematical Modelling & Scientific Computing'],
			body: '<ul class="cv-notes"> <li><em>Sparse-Signal Recovery and Compressive Sensing for Optical Functional Brain Imaging.</em></li> <li>Advisor: Jared Tanner. Co-advisor: Mason Porter.</li> </ul>'
		},
		{
			id: null,
			org: 'Tehran Polytechnic',
			when: '2011',
			roles: [
				'BSc Biomedical Engineering · BSc Electrical Engineering',
				'President, IEEE Student Branch'
			],
			body: null
		}
	],
	honours: [
		{
			year: '2020',
			html: '<b>NTT Data Fellowship</b> — MIT, for <em>Rhizome</em>, a smart memory book'
		},
		{
			year: '2017',
			html: '<b>First place and the Koch AI Prize</b> — MIT Grand Hack, for <em>Memoroom</em>, VR for Alzheimer’s'
		},
		{
			year: '2014',
			html: '<b>Bill Mitchell Design Award</b> — MIT Media Lab'
		},
		{
			year: '2006',
			html: '<b>Khwarizmi Prize</b> — first in mathematics and physics, and third the year before'
		},
		{
			year: '2004',
			html: '<b>Semifinalist</b> — national mathematics and physics olympiads'
		}
	],
	skills: [
		{
			label: 'Programming',
			icon: 'icon-resume-codesquare',
			text: 'Python, TypeScript, MATLAB, Mathematica, GLSL, WGSL'
		},
		{
			label: 'Applications & UI',
			icon: 'icon-resume-browser',
			text: 'SvelteKit, React, Three.js / WebGL'
		},
		{
			label: 'Design & UX',
			icon: 'icon-resume-webdesign01',
			text: 'Adobe Creative Cloud, UX study design, Design Systems'
		},
		{
			label: 'Cloud & data',
			icon: 'icon-resume-database',
			text: 'Azure, AWS, Docker, progressive delivery, Snowflake, multimodal data pipelines'
		},
		{
			label: 'Data science',
			icon: 'icon-resume-chartlinedata01',
			text: 'Time-series analysis, biosignal processing, feature extraction, scientific visualization'
		},
		{
			label: 'Machine learning',
			icon: 'icon-resume-aibrain03',
			text: 'PyTorch, JAX, transformers, self-supervised learning, mechanistic interpretability'
		},
		{
			label: 'Training & alignment',
			icon: 'icon-resume-slidershorizontal',
			text: 'FSDP, DeepSpeed, Ray; SFT, PEFT, LoRA, PPO / DPO, quantization'
		},
		{
			label: 'Inference & serving',
			icon: 'icon-resume-cpu',
			text: 'Ollama, Transformers.js, WebGPU, ONNX / WASM, vLLM'
		},
		{
			label: 'Realtime AI',
			icon: 'icon-resume-audiowaveform',
			text: 'OpenAI Realtime, ElevenLabs, Deepgram; low-latency multithreaded harnesses'
		},
		{
			label: 'Agentic engineering',
			icon: 'icon-resume-workflowsquare03',
			text: 'LangGraph, agent harnesses, RAG, tool orchestration, human-in-the-loop workflows'
		},
		{
			label: 'Evaluation',
			icon: 'icon-resume-checklist',
			text: 'MLflow, DeepEval, benchmark design, automated and human evaluation'
		},
		{
			label: 'Leading & teaching',
			icon: 'icon-cv-lead',
			text: 'AI system architecture · cross-functional R&D · curriculum design and workshops · mentoring · technical recruiting'
		},
		{
			label: 'Languages',
			icon: 'icon-cv-lang',
			text: 'English · Turkish · Persian · Mandarin'
		}
	]
};
