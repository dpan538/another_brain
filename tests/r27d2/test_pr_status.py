import json
import subprocess
import unittest

from scripts.r27d2_pr_status import BASE_BRANCH, HEAD_BRANCH, inspect_pr_status


def completed(args, returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess(args=args, returncode=returncode, stdout=stdout, stderr=stderr)


class R27D2PrStatusTests(unittest.TestCase):
    def test_manual_required_when_gh_missing(self):
        report = inspect_pr_status(exists=lambda name: False)
        self.assertTrue(report["ok"])
        self.assertTrue(report["manualRequired"])
        self.assertFalse(report["prExists"])
        self.assertEqual(report["base"], BASE_BRANCH)
        self.assertEqual(report["head"], HEAD_BRANCH)
        self.assertIn("gh_cli_not_installed", report["reason"])

    def test_existing_pr_is_reported(self):
        def runner(args):
            if args[:3] == ["gh", "auth", "status"]:
                return completed(args)
            if args[:3] == ["gh", "pr", "list"]:
                return completed(
                    args,
                    stdout=json.dumps(
                        [
                            {
                                "number": 27,
                                "url": "https://github.com/dpan538/another_brain/pull/27",
                                "state": "OPEN",
                                "title": "R27D1 preview deployment readiness",
                                "headRefName": HEAD_BRANCH,
                                "baseRefName": BASE_BRANCH,
                            }
                        ]
                    ),
                )
            self.fail(f"unexpected command: {args}")

        report = inspect_pr_status(exists=lambda name: name == "gh", runner=runner)
        self.assertTrue(report["ok"])
        self.assertTrue(report["prExists"])
        self.assertFalse(report["manualRequired"])
        self.assertEqual(report["prs"][0]["headRefName"], HEAD_BRANCH)

    def test_pr_create_when_authenticated_and_missing(self):
        calls = []

        def runner(args):
            calls.append(args)
            if args[:3] == ["gh", "auth", "status"]:
                return completed(args)
            if args[:3] == ["gh", "pr", "list"]:
                return completed(args, stdout="[]")
            if args[:3] == ["gh", "pr", "create"]:
                return completed(args, stdout="https://github.com/dpan538/another_brain/pull/28\n")
            self.fail(f"unexpected command: {args}")

        report = inspect_pr_status(exists=lambda name: name == "gh", runner=runner)
        self.assertTrue(report["ok"])
        self.assertTrue(report["prCreated"])
        self.assertEqual(report["url"], "https://github.com/dpan538/another_brain/pull/28")
        self.assertTrue(any(args[:3] == ["gh", "pr", "create"] for args in calls))


if __name__ == "__main__":
    unittest.main()
