#[path = "../src/mono_contracts/manifest.rs"]
mod manifest;
use manifest::validate_manifest_set;
use serde_json::Value;
const M: &str = include_str!("../../src/test/fixtures/mono-v1/manifest-valid-minimal.json");
const D: &str = include_str!("../../src/test/fixtures/mono-v1/manifest-valid-dependent.json");
const P: &str = include_str!("../../src/test/fixtures/mono-v1/manifest-valid-peer.json");
const I: &str = include_str!("../../src/test/fixtures/mono-v1/manifest-invalid-cases.json");
fn j(s: &str) -> Value {
    serde_json::from_str(s).unwrap()
}
fn m(s: &str) -> Value {
    j(s)["input"]["manifest"].clone()
}
fn patch(mut v: Value, ops: &[Value]) -> Value {
    for op in ops {
        let parts = op["path"]
            .as_str()
            .unwrap()
            .split('/')
            .skip(1)
            .map(|x| x.replace("~1", "/").replace("~0", "~"))
            .collect::<Vec<_>>();
        let (last, parents) = parts.split_last().unwrap();
        let mut t = &mut v;
        for p in parents {
            t = if t.is_object() {
                t.as_object_mut().unwrap().get_mut(p).unwrap()
            } else {
                &mut t.as_array_mut().unwrap()[p.parse::<usize>().unwrap()]
            }
        }
        match op["op"].as_str().unwrap() {
            "remove" => {
                if t.is_object() {
                    t.as_object_mut().unwrap().remove(last);
                } else {
                    t.as_array_mut().unwrap().remove(last.parse().unwrap());
                }
            }
            "replace" => {
                let x = op["value"].clone();
                if t.is_object() {
                    *t.as_object_mut().unwrap().get_mut(last).unwrap() = x
                } else {
                    t.as_array_mut().unwrap()[last.parse::<usize>().unwrap()] = x
                }
            }
            "add" => {
                let x = op["value"].clone();
                if t.is_object() {
                    t.as_object_mut().unwrap().insert(last.clone(), x);
                } else if last == "-" {
                    t.as_array_mut().unwrap().push(x)
                } else {
                    t.as_array_mut().unwrap().insert(last.parse().unwrap(), x)
                }
            }
            _ => panic!(),
        }
    }
    v
}
#[test]
fn valid_manifests_are_typed_and_dependency_ordered() {
    let got = validate_manifest_set(&[m(D), m(M), m(P)], "1.0.0").unwrap();
    assert_eq!(
        got.iter().map(|x| x.id.as_str()).collect::<Vec<_>>(),
        ["fixture-m-peer", "fixture-z-base", "fixture-a-reader-tools"]
    )
}
#[test]
fn all_manifest_rfc6902_cases_match_pinned_code_and_path() {
    let f = j(I);
    for c in f["input"]["cases"].as_array().unwrap() {
        let id = c["caseId"].as_str().unwrap();
        let dependent = c["baseManifestFixtureId"] == "manifest.valid.dependent.v1";
        let changed = patch(
            if dependent { m(D) } else { m(M) },
            c["patch"].as_array().unwrap(),
        );
        let mut set = vec![m(M), m(P), m(D)];
        set[if dependent { 2 } else { 0 }] = changed;
        if id == "required-dependency-cycle" {
            set.remove(2);
            set.push(m(D));
        }
        let e = validate_manifest_set(&set, "1.0.0").expect_err(id);
        let expected = f["expected"]["cases"]
            .as_array()
            .unwrap()
            .iter()
            .find(|x| x["caseId"] == id)
            .unwrap();
        assert_eq!(e.code, expected["errorCode"].as_str().unwrap(), "{id} code");
        assert_eq!(e.path, expected["path"].as_str().unwrap(), "{id} path")
    }
}
