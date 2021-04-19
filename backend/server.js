const express = require("express");
const mongoose = require("mongoose");
const nodeRSA = require("node-rsa");
const { PORT } = require("./config/config");
const { connectDB } = require("./config/db");

const {
  generateVoterID,
  blindVote,
  generateCTFKeys,
  signBlindedVote,
  unblindAndVerifySignature,
  verifySignatureCTF,
  verifyVoteFormat,
} = require("./util");

const app = express();
app.use(express.json());

connectDB();

const Schema = mongoose.Schema;
const candidateSchema = new Schema({
  candidateName: String,
  candidateID: String,
  votesReceived: {
    type: Number,
    default: 0,
  },
});
const voterSchema = new Schema({
  voterName: String,
  voterID: String,
  voteCasted: {
    type: Boolean,
    default: false,
  },
});

const candidateCollection = mongoose.model("Result", candidateSchema);
const voterCollection = mongoose.model("Voter", voterSchema);

app.get("/get-voters", async (req, res) => {
  const voters = await voterCollection.find();
  return res.json(voters);
});

app.post("/add-candidate", async (req, res) => {
  const candidateID = req.body.candidateID;
  const candidateName = req.body.candidateName;
  const registeredCandidates = await candidateCollection.find();
  for (let i = 0; i < registeredCandidates.length; ++i) {
    if (registeredCandidates[i].candidateID === candidateID) {
      return res.json("Incorrect details");
    }
  }
  const newCandidate = new candidateCollection({
    candidateName: candidateName,
    candidateID: candidateID,
  });
  await newCandidate.save();
  return res.json("New candidate resigtered");
});

app.get("/get-candidates", async (req, res) => {
  const candidatesList = await candidateCollection.find();
  return res.json(candidatesList);
});

app.get("/get-voterid", async (req, res) => {
  const voterID = generateVoterID();
  return res.json(voterID);
});

app.post("/register", async (req, res) => {
  const registeredVoters = await voterCollection.find();
  const voterName = req.body.voterName;
  const voterID = req.body.voterID;

  let isNewVoter = true;
  registeredVoters.forEach((registeredVoter) => {
    if (registeredVoter.voterID === voterID) isNewVoter = false;
  });

  if (!isNewVoter) return res.json("Already registered");

  const newVoter = new voterCollection({
    voterName: voterName,
    voterID: voterID,
  });
  await newVoter.save();
  return res.json(
    "Registered successfully. Keep the voter ID secure & private."
  );
});

app.post("/cast-vote", async (req, res) => {
  const voterID = req.body.voterID;
  const votedForCandidateID = req.body.candidateID;
  const votedForCandidateName = req.body.votedFor;

  const registeredVoters = await voterCollection.find();
  const registeredCandidates = await candidateCollection.find();
  let eligible = false;
  for (let i = 0; i < registeredVoters.length; ++i) {
    if (
      registeredVoters[i].voterID.indexOf(voterID) >= 0 &&
      registeredVoters[i].voteCasted === false
    ) {
      eligible = true;
      break;
    }
  }
  if (!eligible) return res.json("Not eligible");

  eligible = false;
  for (let i = 0; i < registeredCandidates.length; ++i) {
    if (
      registeredCandidates[i].candidateID.indexOf(votedForCandidateID) >= 0 &&
      registeredCandidates[i].candidateName === votedForCandidateName
    ) {
      eligible = true;
      break;
    }
  }
  if (!eligible) return res.json("Incorrect details");

  const { signingKey, CTFKey } = generateCTFKeys();
  const publicKeyCTF = new nodeRSA(CTFKey.exportKey("public"));
  const privateKeyCTF = new nodeRSA(CTFKey.exportKey("private"));
  const n_CTF = signingKey.keyPair.n.toString();
  const e_CTF = signingKey.keyPair.e.toString();
  const { blindedVote, blindingFactor } = blindVote(
    votedForCandidateID,
    n_CTF,
    e_CTF
  );

  const signedBlindedVote = signBlindedVote(blindedVote, signingKey);

  const value = unblindAndVerifySignature(
    signedBlindedVote,
    blindingFactor,
    n_CTF,
    e_CTF,
    votedForCandidateID
  );

  const signatureOk = value.ok;
  const signedUnblindedVote = value.signedUnblindedVote;

  console.assert(
    signatureOk === true,
    "Verification failed, check the bit length of the signing key!!!"
  );

  const voteString = voterID + signedUnblindedVote;
  const encryptedVote = publicKeyCTF.encrypt(voteString, "base64");

  const decryptedVote = privateKeyCTF.decrypt(encryptedVote, "utf-8");
  const { receivedVoterID, candidateVotedFor } = verifyVoteFormat(
    decryptedVote
  );

  const candidatesList = await candidateCollection.find();
  const { verdict, votedCandidateID } = verifySignatureCTF(
    candidateVotedFor,
    signingKey,
    candidatesList
  );

  if (verdict) {
    // update candidate vote count in DB
    await candidateCollection.findOneAndUpdate(
      { candidateID: votedCandidateID },
      { $inc: { votesReceived: 1 } }
    );
    // update voter's voted status
    await voterCollection.findOneAndUpdate(
      { voterID: receivedVoterID },
      { voteCasted: true }
    );
    return res.json("Successful!!!");
  }

  return res.json("Unsuccessful!!!");
});

app.get("*", (req, res) => {
  res.json("You missed all valid routes!!!");
});

app.listen(3001, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
