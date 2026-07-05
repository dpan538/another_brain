import hashlib
import json
import time
from dataclasses import dataclass, asdict
from pathlib import Path


def now_utc():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


@dataclass
class LicenseDecision:
    dataset_id: str
    upstream_name: str
    upstream_url: str
    metadata_source_url: str
    license_name: str
    license_url: str
    terms_url: str
    access_status: str
    license_review_status: str
    allowed_to_fetch_metadata: bool
    allowed_to_fetch_bounded_sample: bool
    allowed_to_train_engineering: bool
    allowed_to_train_product_candidate: bool
    allowed_to_release_weights: bool
    allowed_to_commit_raw: bool
    allowed_to_store_raw_in_artifacts: bool
    license_obligations: list
    decision_scope: str
    decision_reason: str
    retrieved_at_utc: str
    source_card_sha256_or_etag: str
    reviewed_by: str = "R27A3 automated license/access admission; final legal/product review still separate"

    def to_dict(self):
        return asdict(self)


SOURCE_SPECS = {
    "baai_industry_corpus": {
        "upstream_name": "BAAI/IndustryCorpus",
        "upstream_url": "https://huggingface.co/datasets/BAAI/IndustryCorpus",
        "metadata_source_url": "https://huggingface.co/api/datasets/BAAI/IndustryCorpus",
        "license_url": "https://www.apache.org/licenses/LICENSE-2.0",
        "terms_url": "",
        "primary_language": "mixed",
        "sample_method": "hf_streaming",
        "hf_dataset": "BAAI/IndustryCorpus",
        "hf_config": None,
    },
    "wikipedia_zh": {
        "upstream_name": "wikimedia/wikipedia zh via official MediaWiki API",
        "upstream_url": "https://huggingface.co/datasets/wikimedia/wikipedia",
        "metadata_source_url": "https://huggingface.co/api/datasets/wikimedia/wikipedia",
        "license_url": "https://creativecommons.org/licenses/by-sa/3.0/",
        "terms_url": "https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use",
        "primary_language": "zh",
        "sample_method": "hf_streaming",
        "hf_dataset": "wikimedia/wikipedia",
        "hf_config": "20231101.zh",
        "api_url": "https://zh.wikipedia.org/w/api.php",
    },
    "skypile_150b": {
        "upstream_name": "Skywork/SkyPile-150B",
        "upstream_url": "https://huggingface.co/datasets/Skywork/SkyPile-150B",
        "metadata_source_url": "https://huggingface.co/api/datasets/Skywork/SkyPile-150B",
        "license_url": "",
        "terms_url": "",
        "primary_language": "zh",
        "sample_method": "blocked_until_terms_clear",
    },
    "fineweb": {
        "upstream_name": "HuggingFaceFW/fineweb",
        "upstream_url": "https://huggingface.co/datasets/HuggingFaceFW/fineweb",
        "metadata_source_url": "https://huggingface.co/api/datasets/HuggingFaceFW/fineweb",
        "license_url": "https://opendatacommons.org/licenses/by/1-0/",
        "terms_url": "https://commoncrawl.org/terms-of-use",
        "primary_language": "en",
        "sample_method": "hf_streaming",
        "hf_dataset": "HuggingFaceFW/fineweb",
        "hf_config": "sample-10BT",
    },
    "fineweb_edu": {
        "upstream_name": "HuggingFaceFW/fineweb-edu",
        "upstream_url": "https://huggingface.co/datasets/HuggingFaceFW/fineweb-edu",
        "metadata_source_url": "https://huggingface.co/api/datasets/HuggingFaceFW/fineweb-edu",
        "license_url": "https://opendatacommons.org/licenses/by/1-0/",
        "terms_url": "https://commoncrawl.org/terms-of-use",
        "primary_language": "en",
        "sample_method": "metadata_only_optional_r27a3",
        "hf_dataset": "HuggingFaceFW/fineweb-edu",
        "hf_config": "sample-10BT",
    },
    "infinity_instruct": {
        "upstream_name": "BAAI/Infinity-Instruct",
        "upstream_url": "https://huggingface.co/datasets/BAAI/Infinity-Instruct",
        "metadata_source_url": "https://huggingface.co/api/datasets/BAAI/Infinity-Instruct",
        "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
        "terms_url": "https://huggingface.co/datasets/BAAI/Infinity-Instruct",
        "primary_language": "mixed",
        "sample_method": "hf_streaming_gated",
        "hf_dataset": "BAAI/Infinity-Instruct",
        "hf_config": "3M",
    },
    "wanjuan_cc": {
        "upstream_name": "WanJuan-CC subset candidate",
        "upstream_url": "https://github.com/opendatalab/WanJuan2.0-WanJuan-CC",
        "metadata_source_url": "https://github.com/opendatalab/WanJuan2.0-WanJuan-CC",
        "license_url": "",
        "terms_url": "",
        "primary_language": "mixed",
        "sample_method": "blocked_until_subset_terms_clear",
    },
    "baai_industry_corpus2": {
        "upstream_name": "BAAI/IndustryCorpus2",
        "upstream_url": "https://huggingface.co/datasets/BAAI/IndustryCorpus2",
        "metadata_source_url": "https://huggingface.co/api/datasets/BAAI/IndustryCorpus2",
        "license_url": "https://www.apache.org/licenses/LICENSE-2.0",
        "terms_url": "",
        "primary_language": "mixed",
        "sample_method": "hf_streaming",
        "hf_dataset": "BAAI/IndustryCorpus2",
        "hf_config": None,
    },
    "fineweb_2": {
        "upstream_name": "HuggingFaceFW/fineweb-2",
        "upstream_url": "https://huggingface.co/datasets/HuggingFaceFW/fineweb-2",
        "metadata_source_url": "https://huggingface.co/api/datasets/HuggingFaceFW/fineweb-2",
        "license_url": "https://opendatacommons.org/licenses/by/1-0/",
        "terms_url": "https://commoncrawl.org/terms-of-use",
        "primary_language": "mixed",
        "sample_method": "hf_streaming",
        "hf_dataset": "HuggingFaceFW/fineweb-2",
        "hf_config": "cmn_Hani",
    },
    "oasst1": {
        "upstream_name": "OpenAssistant/oasst1",
        "upstream_url": "https://huggingface.co/datasets/OpenAssistant/oasst1",
        "metadata_source_url": "https://huggingface.co/api/datasets/OpenAssistant/oasst1",
        "license_url": "https://www.apache.org/licenses/LICENSE-2.0",
        "terms_url": "",
        "primary_language": "mixed",
        "sample_method": "hf_streaming_instruction",
        "hf_dataset": "OpenAssistant/oasst1",
        "hf_config": None,
    },
    "baai_coig": {
        "upstream_name": "BAAI/COIG",
        "upstream_url": "https://huggingface.co/datasets/BAAI/COIG",
        "metadata_source_url": "https://huggingface.co/api/datasets/BAAI/COIG",
        "license_url": "",
        "terms_url": "https://huggingface.co/datasets/BAAI/COIG",
        "primary_language": "zh",
        "sample_method": "metadata_only_subset_review_required",
        "hf_dataset": "BAAI/COIG",
        "hf_config": None,
    },
    "coig_cqia": {
        "upstream_name": "m-a-p/COIG-CQIA",
        "upstream_url": "https://huggingface.co/datasets/m-a-p/COIG-CQIA",
        "metadata_source_url": "https://huggingface.co/api/datasets/m-a-p/COIG-CQIA",
        "license_url": "",
        "terms_url": "https://huggingface.co/datasets/m-a-p/COIG-CQIA",
        "primary_language": "zh",
        "sample_method": "hf_streaming_instruction",
        "hf_dataset": "m-a-p/COIG-CQIA",
        "hf_config": None,
    },
    "tulu_3_sft_mixture": {
        "upstream_name": "allenai/tulu-3-sft-mixture",
        "upstream_url": "https://huggingface.co/datasets/allenai/tulu-3-sft-mixture",
        "metadata_source_url": "https://huggingface.co/api/datasets/allenai/tulu-3-sft-mixture",
        "license_url": "",
        "terms_url": "https://huggingface.co/datasets/allenai/tulu-3-sft-mixture",
        "primary_language": "mixed",
        "sample_method": "metadata_only_recipe_reference",
    },
}


def metadata_digest(blob):
    if isinstance(blob, str):
        blob = blob.encode("utf-8")
    return hashlib.sha256(blob or b"").hexdigest()


def card_license(metadata):
    card = metadata.get("cardData") or {}
    license_name = card.get("license") or ""
    if isinstance(license_name, list):
        license_name = ",".join(str(x) for x in license_name)
    tags = metadata.get("tags") or []
    tag_licenses = [t.split("license:", 1)[1] for t in tags if isinstance(t, str) and t.startswith("license:")]
    return str(license_name or ",".join(tag_licenses) or "unknown").lower()


def decide_source(dataset_id, metadata=None, raw_metadata=b"", retrieved_at=None):
    spec = SOURCE_SPECS[dataset_id]
    metadata = metadata or {}
    retrieved_at = retrieved_at or now_utc()
    lic = card_license(metadata)
    gated = metadata.get("gated")
    access_status = "gated" if gated and gated is not False else "public"
    allowed = False
    status = "unknown"
    obligations = []
    reason = ""
    license_name = lic or "unknown"
    if dataset_id in {"baai_industry_corpus", "baai_industry_corpus2"} and "apache-2.0" in lic and access_status == "public":
        allowed, status = True, "approved_for_engineering"
        obligations = ["attribution", "non_endorsement"]
        reason = "Current Hugging Face metadata reports apache-2.0 and public access; bounded engineering samples only."
    elif dataset_id == "wikipedia_zh":
        allowed, status = True, "approved_for_engineering"
        access_status = "public"
        license_name = "cc-by-sa-3.0,gfdl"
        obligations = ["attribution", "share_alike", "citation_required"]
        reason = "Wikipedia text is public but carries attribution/share-alike obligations; bounded engineering samples only."
    elif dataset_id in {"fineweb", "fineweb_edu", "fineweb_2"} and ("odc-by" in lic or "odc" in lic) and access_status == "public":
        allowed, status = True, "approved_for_engineering"
        obligations = ["attribution", "common_crawl_terms", "citation_required"]
        reason = "Current metadata reports ODC-By/CommonCrawl-derived public access; bounded streaming samples only."
    elif dataset_id == "oasst1" and ("apache-2.0" in lic or "apache" in lic) and access_status == "public":
        allowed, status = True, "approved_for_engineering"
        obligations = ["attribution", "non_endorsement"]
        reason = "OASST1 metadata reports Apache-compatible public access; R27A4 admits final-answer-only instruction candidates for engineering review."
    elif dataset_id == "coig_cqia" and access_status == "public" and lic not in {"unknown", ""}:
        allowed, status = True, "approved_for_engineering"
        obligations = ["attribution", "subset_specific_terms", "citation_required"]
        reason = "COIG-CQIA has current public metadata with a declared license; R27A4 admits bounded instruction candidates only."
    elif dataset_id == "baai_coig":
        status = "conditional_for_engineering"
        obligations = ["attribution", "subset_specific_terms", "citation_required"]
        reason = "BAAI/COIG requires subset-level license review; R27A4 records metadata but does not globally admit all subsets."
    elif dataset_id == "tulu_3_sft_mixture":
        status = "blocked"
        obligations = ["subset_specific_terms", "recipe_reference_only"]
        reason = "Tulu mixture is recipe/reference only until every subset license is separately admitted."
    elif dataset_id == "infinity_instruct":
        status = "blocked" if access_status == "gated" else "conditional_for_engineering"
        obligations = ["attribution", "share_alike", "subset_specific_terms"]
        reason = "Instruction source is gated or requires explicit access terms; no token bypass or personal auth is used in R27A4."
    elif dataset_id == "skypile_150b":
        status = "conditional_for_engineering"
        obligations = ["subset_specific_terms", "citation_required"]
        reason = "SkyPile terms are not clear enough from automated metadata for engineering training admission."
    elif dataset_id == "wanjuan_cc":
        access_status = "unknown"
        status = "conditional_for_engineering"
        obligations = ["subset_specific_terms", "citation_required"]
        reason = "WanJuan subset-specific metadata/access path must be reviewed before bounded engineering training."
    else:
        status = "blocked"
        reason = "No automated R27A3 rule admitted this source for engineering training."
    return LicenseDecision(
        dataset_id=dataset_id,
        upstream_name=spec["upstream_name"],
        upstream_url=spec["upstream_url"],
        metadata_source_url=spec["metadata_source_url"],
        license_name=license_name,
        license_url=spec.get("license_url", ""),
        terms_url=spec.get("terms_url", ""),
        access_status=access_status,
        license_review_status=status,
        allowed_to_fetch_metadata=True,
        allowed_to_fetch_bounded_sample=bool(allowed),
        allowed_to_train_engineering=bool(allowed),
        allowed_to_train_product_candidate=False,
        allowed_to_release_weights=False,
        allowed_to_commit_raw=False,
        allowed_to_store_raw_in_artifacts=bool(allowed),
        license_obligations=obligations,
        decision_scope="R27A4 engineering campaign only, not product training, not phase_4, not release",
        decision_reason=reason,
        retrieved_at_utc=retrieved_at,
        source_card_sha256_or_etag=metadata.get("sha") or metadata_digest(raw_metadata),
    )


def write_json(path, data):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
