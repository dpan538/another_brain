#!/usr/bin/env python3
from src.training.campaign.r29a0_masked_debug import CAMPAIGN_ID, create_campaign_marker


if __name__ == "__main__":
    print(create_campaign_marker(CAMPAIGN_ID))
