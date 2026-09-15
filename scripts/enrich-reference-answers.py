#!/usr/bin/env python3
"""
Autonomous Reference Answer Block Enricher for Generative Engine Optimization (GEO).
Replaces placeholder listing text in content/reference/*.md with dense, authoritative,
45-65 word definitions combining modern biochemistry and classical Ayurvedic pharmacology.
"""

import os
import glob
import re
import yaml

REFERENCE_DIR = "/Users/jairajsharma/Projects/ayurveda-atlas/content/reference"

# Curated, evidence-dense 45-65 word definitions for every reference category
DEFINITIONS = {
    "adaptogenic": (
        "Adaptogenic agents are natural compounds and botanicals that enhance non-specific physiological "
        "resistance to physical, biological, and emotional stressors. They modulate the hypothalamic-pituitary-adrenal "
        "(HPA) axis, normalize daytime cortisol rhythms, and stabilize cellular homeostasis without pharmacological "
        "sedation. In classical Ayurveda, they correspond directly to Balya (strength-promoting), Ojas-enhancing, and "
        "Rasayana dravyas, exemplified by Ashwagandha, Guduchi, and Bala."
    ),
    "rasayana": (
        "Rasayana agents are premier Ayurvedic rejuvenating and geroprotective substances that optimize tissue "
        "nutrition (Dhatu Poshana) and cellular longevity. Pharmacologically, they exhibit potent antioxidant, "
        "telomere-protective, and immunomodulatory activities that delay senescence and maintain homeostatic vitality. "
        "Classical texts define Rasayana as the therapeutic pathway to obtaining supreme bodily tissues (Labhopayo hi "
        "shastanam rasadinam), led by Amalaki, Haritaki, Guduchi, and Shilajit."
    ),
    "medhya-nootropic": (
        "Medhya nootropic agents are cognitive enhancers that cross the blood-brain barrier to support memory retention "
        "(Dhi, Dhriti, Smriti), synaptic plasticity, and neuronal repair. They modulate central neurotransmission—particularly "
        "cholinergic and GABAergic pathways—while reducing cerebral oxidative stress and neuroinflammation. Foremost classical "
        "Medhya Rasayanas include Brahmi (Bacopa monnieri), Shankhpushpi, Mandukaparni, and Yashtimadhu, widely evaluated "
        "for neuroprotection and executive focus."
    ),
    "immunomodulatory": (
        "Immunomodulatory agents regulate innate and adaptive immune cell function, stimulating phagocytosis, activating natural "
        "killer (NK) cells, and modulating pro-inflammatory cytokine expression (TNF-alpha, IL-6). Rather than causing non-specific "
        "hyperactivity, they restore immunological equilibrium. In classical Dravyaguna, this function is termed Vyadhikshamatwa "
        "(disease resistance), fundamentally embodied by Guduchi (Tinospora cordifolia), Ashwagandha, and classical Chyawanprash."
    ),
    "immune-system-rasayana": (
        "Immune-system Rasayana botanicals bridge classical immunorestorative therapy with modern cellular immunology. They "
        "stimulate bone marrow hematopoietic proliferation, increase circulating lymphocyte counts, and normalize secretory IgA "
        "levels. Traditionally understood as building Ojas—the vital essence of all seven physiological Dhatus—these botanicals, "
        "including Giloy, Tulsi, Amla, and Haridra, provide seasonal resilience and upper respiratory mucosal protection."
    ),
    "antiinflammatory": (
        "Anti-inflammatory agents inhibit key enzymatic cascades of the inflammatory cascade, notably cyclooxygenase (COX-2), "
        "lipoxygenase (5-LOX), and nuclear factor kappa B (NF-kB) transcriptional pathways. By reducing circulating prostaglandin "
        "and leukotriene synthesis, they ease acute and chronic tissue swelling. In Ayurvedic pharmacology, they act as Shothahara "
        "and Amapachana dravyas, classically represented by Sallaki (Boswellia serrata), Guggulu, Haridra (Curcuma longa), and Shunthi."
    ),
    "antiinflammatory-pain": (
        "Anti-inflammatory and analgesic compounds provide dual symptomatic relief and systemic modulation of pain signaling. "
        "They suppress local tissue inflammation while modulating nociceptive sensory input through vanilloid receptor and central "
        "serotonergic pathways. Classically classified as Vedanasthapana (pain-subsiding) and Shothahara, key formulations combine "
        "Shallaki, Guggulu, Nirgundi, and Eranda to pacify aggravated Vata in musculoskeletal tissues."
    ),
    "antiinflammatory-pain-across-traditions": (
        "Cross-traditional comparative analysis of anti-inflammatory and pain therapies integrates Ayurvedic Dravyaguna, Traditional "
        "Chinese Medicine (TCM), and global ethnobotany. While Ayurveda emphasizes metabolic toxin removal (Ama Pachana) and Vata "
        "pacification using resinous guggulus and aromatic roots, TCM clears heat and dispels dampness, converging pharmacologically "
        "on common diterpene, sesquiterpene, and polyphenol-driven COX-2 inhibition pathways."
    ),
    "cardioprotective": (
        "Cardioprotective agents preserve myocardial integrity, improve coronary microcirculation, and optimize lipid fractions "
        "(lowering LDL and triglycerides while elevating HDL). They enhance vascular endothelial nitric oxide production and scavenge "
        "cardiac free radicals. In classical Ayurveda, they are known as Hridya dravyas—substances inherently beneficial to the "
        "heart and Prana—championed by Arjuna (Terminalia arjuna) bark, Pushkarmoola, and Guggulu."
    ),
    "hepatoprotective": (
        "Hepatoprotective botanicals preserve hepatocyte cell membrane stability, stimulate hepatic microsomal protein synthesis, "
        "and enhance Phase I and Phase II liver detoxification pathways. They prevent lipid peroxidation induced by chemical toxins, "
        "alcohol, and heavy metals. Classically classified as Yakriduttejaka and Pittarechaka dravyas, premier examples include "
        "Bhumyamalaki (Phyllanthus niruri), Kalmegh (Andrographis paniculata), and Katuki (Picrorhiza kurroa)."
    ),
    "neuroprotective": (
        "Neuroprotective agents attenuate neuronal apoptosis, mitigate excitotoxicity mediated by excess glutamate, and inhibit "
        "the accumulation of amyloid plaques and tau hyperphosphorylation in the central nervous system. By supporting mitochondrial "
        "bioenergetics and cerebral blood flow, they maintain cognitive faculties into advanced age. Classical Medhya and Vata-shamana "
        "herbs including Ashwagandha, Brahmi, Jyotishmati, and Gotu Kola demonstrate prominent neuroprotective activity."
    ),
    "antioxidant": (
        "Antioxidant agents neutralize reactive oxygen species (ROS) and reactive nitrogen species (RNS) through direct free-radical "
        "scavenging and upregulation of endogenous antioxidant enzymes (superoxide dismutase, catalase, glutathione peroxidase). "
        "They prevent cellular oxidative damage, lipid peroxidation, and DNA strand breakage. Ayurvedic Rasayana fruits—most notably "
        "Amla (Phyllanthus emblica), Haritaki, and Bibhitaki—represent the richest natural botanical antioxidant sources."
    ),
    "antimicrobial": (
        "Antimicrobial botanicals exhibit broad-spectrum bactericidal, antifungal, and antiviral activities by disrupting microbial "
        "cell wall permeability, inhibiting bacterial protein translation, and degrading biofilm formation without inducing synthetic "
        "resistance. Classically termed Krimighna dravyas (parasite and pathogen destroyers), premier representatives include Neem "
        "(Azadirachta indica), Haridra, Vidanga (Embelia ribes), and Tulsi."
    ),
    "antidiabetic": (
        "Antidiabetic botanical agents improve systemic glucose metabolism by enhancing peripheral insulin sensitivity, stimulating "
        "pancreatic beta-cell insulin secretion, and inhibiting intestinal carbohydrate digestive enzymes (alpha-glucosidase and "
        "alpha-amylase). In Ayurveda, they are formulated for Madhumeha (diabetes), classically targeting metabolic Kapha-Medas imbalances "
        "using Meshashringi (Gymnema sylvestre), Vijaysar (Pterocarpus marsupium), Jamun seed, and Karela."
    ),
    "diabetes-metabolism": (
        "Metabolic and diabetic botanical references address the comprehensive management of blood glucose, insulin resistance, "
        "and lipid dysregulation. They stimulate cellular AMPK activation, reduce hepatic gluconeogenesis, and prevent advanced "
        "glycation end-product (AGE) microvascular damage. Formulations unite bitter and astringent herbs (Tikta-Kashaya dravyas) "
        "to kindle digestive fire (Agni) while purifying the circulatory tissue channels (Raktavaha Srotas)."
    ),
    "digestive-health": (
        "Digestive health botanicals stimulate gastric and pancreatic secretions, regulate intestinal peristalsis, and eliminate "
        "undigested metabolic toxins (Ama). Known classically as Deepana (appetite-kindling) and Pachana (digestive) dravyas, "
        "they optimize digestive agni without aggravating pitta. The premier classical triad is Trikatu (Shunthi, Maricha, Pippali), "
        "alongside Hingwastak churnas and carminative seeds like Ajwain and Jeeraka."
    ),
    "respiratory-health": (
        "Respiratory health botanicals support bronchial airway relaxation, liquefy mucosal congestion, and soothe irritated upper "
        "respiratory epithelia. They exhibit mast-cell stabilizing, bronchodilating, and expectorant properties. Classically categorized "
        "as Kasahara (cough-relieving) and Shwasahara (dyspnea-relieving) dravyas, leading remedies include Vasa (Adhatoda vasica), "
        "Kantakari, Yashtimadhu, and Pippali, balancing aggravated Prana Vata and Kledaka Kapha."
    ),
    "bronchodilator": (
        "Bronchodilator botanicals relax bronchial smooth muscle spasms, reduce airway hyperresponsiveness, and widen pulmonary "
        "lumen diameters to facilitate unobstructed breathing. They act via beta-2 adrenergic stimulation and phosphodiesterase "
        "inhibition. Classically designated Shwasahara dravyas, the benchmark botanical is Vasa (Adhatoda vasica), containing the "
        "active quinazoline alkaloid vasicine, widely studied for acute respiratory ease."
    ),
    "expectorant": (
        "Expectorant agents thin, liquefy, and loosen tenacious tracheobronchial mucus, promoting ciliary clearance and productive "
        "cough elimination from the respiratory tract. They stimulate respiratory tract fluid secretions through vagal and local "
        "mucosal pathways. In classical Ayurvedic pharmacy, these Kaphanissaraka herbs are led by Kantakari, Pippali, Yashtimadhu, "
        "and Bharangi, often delivered with honey as an Anupana."
    ),
    "liver-detoxification": (
        "Liver detoxification botanicals stimulate bile production and secretion (choleretic and cholagogue actions), upregulate "
        "phase II glutathione conjugation, and clear systemic metabolic waste. In classical Ayurveda, the liver (Yakrit) is the seat "
        "of Ranjaka Pitta, responsible for blood formation. Bitter tonics like Bhunimba (Andrographis), Katuki, and Bhringraj cool "
        "excess hepatic heat while promoting biliary flow."
    ),
    "joint-musculoskeletal": (
        "Joint and musculoskeletal botanicals inhibit pro-inflammatory cytokines, preserve synovial fluid viscosity, and prevent "
        "articular cartilage matrix degradation in degenerative and autoimmune joint conditions. Classified classically under "
        "Sandhigata Vata and Amavata protocols, therapies pair resinous guggulus (Yograj, Kaishore) with Shallaki and Ashwagandha "
        "to restore joint flexibility and bone tissue strength (Asthi Dhatu)."
    ),
    "brain-nervous-system": (
        "Brain and nervous system botanicals optimize central neurotransmitter balance, enhance cerebral perfusion, and protect "
        "oligodendrocytes and myelin sheaths from oxidative degeneration. In classical texts, these Medhya Rasayana and Majja Dhatu "
        "nourishers pacify Prana and Majja Vata, combining cooling and stabilizing herbs like Brahmi, Shankhpushpi, Jatamansi, "
        "and Tagara to foster emotional composure, memory, and restorative sleep."
    ),
    "heart-cardiovascular": (
        "Cardiovascular therapeutic references address coronary artery perfusion, systemic blood pressure regulation, and cardiac "
        "muscle contractility. They stabilize endothelial lining function and inhibit pathological platelet aggregation. Known "
        "classically as Hridya and Raktaprasadana herbs, the centerpiece remains Arjuna (Terminalia arjuna) bark, traditionally "
        "boiled in milk (Ksheerapaka vidhi) to maximize the bioavailability of its cardioprotective triterpenoids and flavonoids."
    ),
    "kidney-urinary": (
        "Renal and urinary botanicals promote gentle, non-irritating diuresis (Mutrala action), flush urinary crystalloids, and "
        "protect glomeruli from inflammatory sclerosis. They inhibit calcium oxalate crystallization, preventing urolithiasis "
        "(Ashmari). Classical renal Rasayanas include Punarnava (Boerhavia diffusa), Gokshura (Tribulus terrestris), Pashanabheda, "
        "and Varuna, balancing Apana Vata and clearing excess Kleda from the Mutravaha Srotas."
    ),
    "kidney-urinary-across-traditions": (
        "Cross-traditional renal ethnobotany compares Ayurvedic Mutravaha therapies with global herbal traditions. While Ayurveda "
        "emphasizes rejuvenating the kidney parenchyma with sweet, cooling adaptogens like Gokshura and Punarnava, Western herbalism "
        "focuses on acute aquatic aquaretics (Uva-ursi, Horsetail), converging on mutual antimicrobial, anti-lithic, and nephroprotective "
        "mechanisms that safeguard glomerular filtration."
    ),
    "diuretic": (
        "Diuretic botanical agents promote the excretion of excess water and sodium through renal tubules without inducing secondary "
        "electrolyte depletion. They improve glomerular filtration rate and soothe urinary mucosal lining irritation. Known classically "
        "as Mutrala dravyas, the benchmark herbs are Gokshura, Punarnava, Trinapanchamoola (five classical sacred grasses), and "
        "Coriander seed infusions, routinely used for fluid retention and urinary tract comfort."
    ),
    "womens-health": (
        "Women's health botanicals regulate hypothalamic-pituitary-ovarian (HPO) axis function, balance endogenous estrogen and "
        "progesterone receptor signaling, and tone uterine smooth muscle tissues. Classically recognized as Artavajanana and "
        "Stanyajanana dravyas, premier remedies center on Shatavari (Asparagus racemosus), Ashoka (Saraca asoca) bark, and Lodhra, "
        "supporting menstrual regularity, reproductive vitality, and menopausal ease."
    ),
    "mens-health-vitality": (
        "Men's health and vitality botanicals enhance spermatogenesis, optimize free and total testosterone bioavailability, and "
        "protect testicular Leydig cells from oxidative damage. Termed Vajikarana and Shukra-janana in classical Ayurvedic texts, "
        "these premier aphrodisiac and restorative dravyas include Kapikacchu (Mucuna pruriens, rich in natural L-DOPA), Ashwagandha, "
        "Gokshura, and purified Shilajit, enhancing stamina, muscle tone, and reproductive vigor."
    ),
    "skin-beauty": (
        "Dermatological and skin vitality botanicals purify circulatory blood tissue (Rakta Shodhana), stimulate dermal collagen "
        "synthesis, and calm inflammatory dermatoses. Known classically as Varnya (complexion-brightening) and Kushtaghna (skin-clearing) "
        "herbs, key botanical remedies feature Manjistha (Rubia cordifolia), Khadira (Acacia catechu), Sariva (Hemidesmus indicus), "
        "and Haridra, clearing subcutaneous heat and promoting clear, lustrous skin."
    ),
    "wound-healing": (
        "Wound healing botanicals accelerate cutaneous tissue regeneration, promote fibroblast migration, and enhance collagen "
        "cross-linking while exerting local antimicrobial and anti-hemorrhagic barrier actions. In classical Ayurvedic surgery "
        "(Shalya Tantra), these are categorized as Ropana (healing) and Vrana Shodhana (wound-cleansing) substances, led by Jatyadi "
        "taila formulations, Lodhra, Yashtimadhu, and pure cold-pressed sesame oil."
    ),
    "eye-health": (
        "Ocular botanicals protect retinal pigment epithelial cells from oxidative photo-stress, enhance tear film stability, and "
        "strengthen microvascular capillary perfusion to the optic nerve. Termed Chakshushya (eye-beneficial) dravyas, classical "
        "Ayurveda places Triphala at the apex of ocular care, frequently administered internally with ghee and honey or applied "
        "externally in specialized Netra Tarpana procedures to preserve visual acuity."
    ),
    "anxiolytic": (
        "Anxiolytic botanical agents reduce acute psychological apprehension, ease somatic nervous tension, and induce central calm "
        "without causing motor impairment or chemical dependency. They modulate GABAergic receptor sensitivity and blunt autonomic "
        "sympathetic surges. Classical Manonasaka and Medhya remedies center on Jatamansi (Nardostachys jatamansi), Tagara (Valeriana "
        "wallichii), Brahmi, and Shankhpushpi, pacifying agitated Prana and Udana Vata."
    ),
    "analgesic": (
        "Analgesic botanicals inhibit nociceptive pain signal transmission across peripheral and central sensory pathways, damping "
        "inflammatory hyperalgesia. Classically known as Vedanasthapana dravyas, premier remedies combine cooling anti-inflammatory "
        "extracts (Shallaki, Guggulu) with warming topical rubefacients (Eucalyptus, Camphor, Nirgundi) to ease muscular and joint discomfort "
        "by restoring unobstructed Vata flow through physical tissue channels."
    ),
    "antipyretic": (
        "Antipyretic botanicals reset the hypothalamic thermoregulatory set-point and clear systemic inflammatory pyrogens during febrile "
        "episodes. In classical Ayurveda, fever is Jwara—the primary somatic disease born from impaired digestive fire (Jatharagni) "
        "and disturbed Pitta-Kapha doshas. Jvarahara herbs like Kiratatikta (Swertia chirata), Kalmegh, Guduchi, and Parpata clear "
        "internal heat while restoring digestive metabolism."
    ),
    "fever-infection": (
        "Therapeutic references for fever and infection combine antimicrobial, antipyretic, and detoxifying (Amapachana) herbs. They "
        "neutralize circulating pathogenic toxins, enhance cutaneous perspiration (diaphoretic action), and preserve lean body mass "
        "during acute illness. Centered around classical formulations like Mahasudarshana and Amritarishta, they pair bitter bitters "
        "with cooling barks to restore constitutional vitality without digestive suppression."
    ),
    "laxative": (
        "Laxative and bowel-regulating botanicals soften fecal mass, stimulate colonic peristaltic contractions, and ensure complete, "
        "non-griping elimination. Classically designated as Anulomana and Rechana dravyas, gentle non-habit-forming bowel tonics include "
        "Haritaki (Terminalia chebula), Amla, Triphala, and Isabgol husk, which regulate Apana Vata without causing dehydration or "
        "damaging normal intestinal mucosa."
    ),
    "anticancer": (
        "Anticancer and antineoplastic phytochemicals exhibit cytotoxic, pro-apoptotic, and anti-angiogenic properties in preclinical "
        "oncological models, arresting malignant cell cycles while protecting healthy tissues from oxidative mutagens. Known classically "
        "in the management of deep tumors (Arbuda and Granthi), premier herbs under modern oncology investigation include Ashwagandha "
        "(withaferin A), Curcumin, Guduchi, and Kanchanara (Bauhinia variegata)."
    ),
    # Phytochemical Constituents
    "piperine": (
        "Piperine is a pungent alkaloid found primarily in black pepper (Piper nigrum) and long pepper (Piper longum). Renowned as "
        "the premier natural bioavailability enhancer (Yogavahi), piperine reversibly inhibits intestinal and hepatic CYP3A4, CYP2D6, "
        "and P-glycoprotein efflux pumps, increasing the systemic bioavailability of co-administered botanicals (such as Curcumin) "
        "by up to 20-fold while stimulating gastrointestinal digestive fire."
    ),
    "gallic-acid": (
        "Gallic acid (3,4,5-trihydroxybenzoic acid) is a low-molecular-weight phenolic compound abundantly present in classical "
        "Ayurvedic myrobalan fruits, including Amla, Haritaki, and Bibhitaki. It exhibits exceptional antioxidant, anti-inflammatory, "
        "and hepatoprotective properties, scavenging reactive oxygen species, downregulating NF-kB activation, and protecting vascular "
        "endothelium from oxidative and lipid peroxidative stress."
    ),
    "quercetinquercetin": (
        "Quercetin is a ubiquitous flavonol possessing potent antioxidant, mast-cell stabilizing, and anti-inflammatory activities. "
        "It downregulates the expression of inflammatory enzymes (COX-2, iNOS), chelates transition metals, and stabilizes vascular "
        "capillary wall integrity. In classical Ayurvedic botanicals, quercetin is a primary active flavonoid found in Ashoka, "
        "Triphala, and numerous cardioprotective tree barks."
    ),
    "kaempferol": (
        "Kaempferol is a natural dietary flavonol with documented antioxidant, anti-inflammatory, and neuroprotective properties. "
        "It modulates multiple cellular signaling pathways, including MAPK and PI3K/Akt, inducing apoptosis in aberrant cells while "
        "protecting pancreatic beta cells and neurons from oxidative apoptosis. Abundant in medicinal plants such as Moringa, "
        "Sesbania (Agastya), and sacred Ficus species."
    ),
    "ellagic-acid": (
        "Ellagic acid is a natural dimeric gallic acid polyphenol and the bioactive hydrolytic derivative of ellagitannins. Present "
        "in high concentrations in Amalaki, Pomegranate (Dadima), and Triphala, it provides profound antioxidant, chemopreventive, "
        "and cardioprotective benefits by attenuating cellular lipid peroxidation and stabilizing collagen cross-linking in connective tissues."
    ),
    "catechin": (
        "Catechins are natural flavan-3-ol polyphenols renowned for their potent free-radical scavenging, cardioprotective, and "
        "astringent (Kashaya) properties. They inhibit LDL oxidation, support vascular endothelial elasticity, and promote mucosal "
        "tissue healing. In classical Ayurvedic pharmacognosy, catechins are concentrated in Khadira (Acacia catechu) and various "
        "medicinal barks indicated for oral hygiene and wound healing."
    ),
    "saponins": (
        "Saponins are high-molecular-weight amphiphilic glycosides possessing triterpenoid or steroidal aglycone cores. They exhibit "
        "notable expectorant, immunomodulatory, cholesterol-lowering, and membrane-permeabilizing properties. Key Ayurvedic adaptogenic "
        "and rejuvenating botanicals—including Shatavari (shatavarins), Gokshura, and Yashtimadhu (glycyrrhizin)—owe their systemic tonic "
        "actions to dense saponin fractions."
    ),
    "flavonoids": (
        "Flavonoids represent a large class of plant secondary metabolites characterized by a 15-carbon phenylpropanoid skeleton. "
        "They exert potent antioxidant, capillary-strengthening, and anti-allergic effects by inhibiting histamine release and "
        "modulating protein kinase enzymes. Present across hundreds of Ayurvedic botanicals, flavonoids represent the molecular "
        "basis of many classical Vata-Pitta pacifying and vascular Rasayana therapies."
    ),
    "tannins": (
        "Tannins are polyphenolic biomolecules known for their astringent (Kashaya) properties, ability to precipitate proteins, "
        "and form protective protective coats over irritated mucous membranes. In Ayurveda, tannins are the primary biochemical "
        "constituents driving Stambhana (hemostatic and binding) actions, abundantly present in Triphala, Arjuna bark, and Lodhra "
        "to soothe gastrointestinal mucosal inflammation."
    ),
    "stigmasterol": (
        "Stigmasterol is an unsaturated plant sterol structurally analogous to animal cholesterol. Pharmacologically, it competitively "
        "inhibits intestinal cholesterol absorption, promotes anti-stiffness and anti-inflammatory activity in musculoskeletal joints, "
        "and serves as an endocrine precursor. Found in Ashwagandha, Bala, and Vidari, stigmasterol contributes directly to their "
        "classical Balya and muscle-nourishing Rasayana properties."
    ),
    "ursolic-acid": (
        "Ursolic acid is a pentacyclic triterpenoid compound with pronounced anti-inflammatory, hepatoprotective, and muscle-preserving "
        "actions. It activates cellular AMPK pathways, stimulates mitochondrial biogenesis, and protects skeletal muscle from disuse "
        "atrophy. Concentrated in Holy Basil (Tulsi), Bilwa patra, and Rosemary, ursolic acid drives modern scientific interest as a "
        "metabolic and longevity-enhancing agent."
    ),
    "oleanolic-acid": (
        "Oleanolic acid is a naturally occurring pentacyclic triterpenoid isomer of ursolic acid. It exhibits broad hepatoprotective, "
        "antiviral, and anti-inflammatory activities, enhancing cellular glutathione production and protecting hepatocytes from xenobiotic "
        "toxicity. Commonly present in Chirayata, Apamarga, and Badara, it represents an essential hepatoprotective biomarker in classical Dravyaguna."
    ),
    "lupeol": (
        "Lupeol is a pharmacologically active triterpene displaying powerful anti-inflammatory, anti-arthritic, and anti-urolithic "
        "properties. It inhibits neutrophil infiltration and downsizes pro-inflammatory eicosanoids. In Ayurvedic renal pharmacopoeia, "
        "lupeol is a flagship constituent of Varuna (Crataeva nurvala), scientifically validated for preventing urinary stone formation "
        "and relieving benign prostatic congestion."
    ),
    # Botanical Families
    "fabaceae": (
        "The Fabaceae (Leguminosae) botanical family encompasses numerous premier Ayurvedic medicinal plants, characterized by "
        "nitrogen-fixing root nodules, papilionaceous flowers, and high flavonoid and saponin concentrations. Key Ayurvedic Fabaceae "
        "taxa include Yashtimadhu (Glycyrrhiza glabra), Aparajita (Clitoria ternatea), and Asana (Pterocarpus marsupium), valued "
        "for their sweet, cooling, and metabolically balancing Rasayana properties."
    ),
    "rosaceae": (
        "The Rosaceae botanical family is renowned in classical pharmacology for its rich accumulation of astringent tannins, "
        "antioxidant anthocyanins, and soothing volatile oils. In classical Ayurvedic applications, Rosaceae members such as Taruni "
        "(Rosa damascena / Damask Rose) and Badara are indicated for cooling Pitta heat, soothing cardiac palpitations, and "
        "supporting dermatological beauty and emotional composure."
    ),
    "zingiberaceae": (
        "The Zingiberaceae (ginger) family comprises aromatic rhizomatous perennials containing pungent volatile essential oils "
        "and bioactive gingerols, shogaols, and curcuminoids. These premier Ayurvedic culinary and therapeutic spices—including Shunthi "
        "(Zingiber officinale), Haridra (Curcuma longa), and Ela (Elettaria cardamomum)—stimulate digestive agni, clear respiratory "
        "kapha congestion, and provide systemic anti-inflammatory circulation."
    )
}

def main():
    files = glob.glob(os.path.join(REFERENCE_DIR, "*.md"))
    print(f"Auditing {len(files)} reference hub files in {REFERENCE_DIR}...")
    updated = 0

    for fpath in sorted(files):
        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read()

        parts = content.split("---")
        if len(parts) < 3:
            continue

        frontmatter_text = parts[1]
        body_text = "---".join(parts[2:])

        try:
            meta = yaml.safe_load(frontmatter_text)
        except Exception as e:
            print(f"Error parsing YAML in {fpath}: {e}")
            continue

        slug = meta.get("slug", "")
        if slug in DEFINITIONS:
            new_answer = DEFINITIONS[slug]
            # Replace answer field in frontmatter
            old_answer = meta.get("answer", "")
            # Word count of new answer
            wc = len(new_answer.split())

            # Update YAML frontmatter
            meta["answer"] = new_answer
            # Dump back
            new_frontmatter = yaml.dump(meta, sort_keys=False, allow_unicode=True, width=1000)

            # Reconstruct file
            new_content = f"---{new_frontmatter}---{body_text}"
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(new_content)

            updated += 1
            print(f"  [UPDATED] {slug:35} -> {wc} words")

    print(f"\nSuccessfully enriched {updated}/{len(files)} reference hub pages with authoritative answer blocks!")

if __name__ == "__main__":
    main()
